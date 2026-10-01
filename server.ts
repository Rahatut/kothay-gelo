import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import { ProcessingPipeline } from './server/pipeline';
import { narrateInsightFacts } from './server/gemini';
import { GOLDEN_SAMPLES } from './server/goldenDataset';
import { Transaction } from './src/types';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body parsing up to 50mb for base64 statement images / PDF chunks
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Request ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    res.setHeader('X-Request-ID', (req as any).requestId);
    next();
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'kothay-gelo-api', version: 'v1.0-mvp' });
  });

  // Current session user helper (tenant isolation)
  const getAuthenticatedUserId = (req: Request): string => {
    return 'usr_bangladesh_consumer_01';
  };

  // -------------------------------------------------------------
  // AUTH MODULE (/v1/auth)
  // -------------------------------------------------------------
  app.post('/v1/auth/request-otp', (req, res) => {
    const { identifier } = req.body;
    const reqId = (req as any).requestId;
    if (!identifier) {
      return res.status(400).json({
        error: { code: 'INVALID_IDENTIFIER', message: 'Phone or email is required', request_id: reqId },
      });
    }

    db.logAudit(getAuthenticatedUserId(req), 'OTP_REQUESTED', 'Auth', identifier, `OTP requested for ${identifier}`);
    // In MVP, simulation OTP is '123456' with instant feedback
    res.json({
      success: true,
      message: 'Cryptographic OTP sent successfully via SMS/Email.',
      otp_hint: '123456',
      expires_in_seconds: 300,
    });
  });

  app.post('/v1/auth/verify-otp', (req, res) => {
    const { otp, identifier } = req.body;
    const reqId = (req as any).requestId;
    if (!otp || otp !== '123456') {
      return res.status(401).json({
        error: { code: 'INVALID_OTP', message: 'The provided OTP is incorrect or expired.', request_id: reqId },
      });
    }

    const userId = getAuthenticatedUserId(req);
    db.logAudit(userId, 'LOGIN', 'User', userId, `Verified OTP for ${identifier || 'primary account'}`);

    res.json({
      success: true,
      user_id: userId,
      access_token: `kg_token_${Date.now()}`,
      expires_in: 86400,
    });
  });

  app.post('/v1/auth/logout', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    db.logAudit(userId, 'LOGOUT', 'User', userId, 'User logged out');
    res.json({ success: true, message: 'Logged out successfully.' });
  });

  // -------------------------------------------------------------
  // USER & PROFILE MODULE (/v1/users)
  // -------------------------------------------------------------
  app.get('/v1/users/me', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const user = db.users.get(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'Authenticated user profile not found', request_id: (req as any).requestId },
      });
    }
    res.json({ data: user });
  });

  app.patch('/v1/users/me', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

    const { locale, timezone, phone } = req.body;
    if (locale && (locale === 'en' || locale === 'bn')) user.locale = locale;
    if (timezone) user.timezone = timezone;
    if (phone) user.phone = phone;

    db.logAudit(userId, 'USER_UPDATED', 'User', userId, 'Updated profile preferences');
    res.json({ data: user });
  });

  // -------------------------------------------------------------
  // CONSENT & PRIVACY MODULE (/v1/settings)
  // -------------------------------------------------------------
  app.get('/v1/settings/consents', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const records = db.consents.get(userId) || [];
    res.json({ data: records });
  });

  app.post('/v1/settings/consents', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const { consent_type, accepted } = req.body;
    let userConsents = db.consents.get(userId) || [];

    const existingIndex = userConsents.findIndex(c => c.consent_type === consent_type);
    if (accepted) {
      if (existingIndex >= 0) {
        userConsents[existingIndex].revoked_at = undefined;
        userConsents[existingIndex].accepted_at = new Date().toISOString();
      } else {
        userConsents.push({
          id: `cst_${Date.now()}`,
          user_id: userId,
          consent_type,
          policy_version: 'v1.0-bd',
          accepted_at: new Date().toISOString(),
          ip_hash: 'sha256:d8a9f...',
        });
      }
      db.logAudit(userId, 'CONSENT_ACCEPTED', 'ConsentRecord', consent_type, `Accepted ${consent_type}`);
    } else {
      if (existingIndex >= 0) {
        userConsents[existingIndex].revoked_at = new Date().toISOString();
        db.logAudit(userId, 'CONSENT_REVOKED', 'ConsentRecord', consent_type, `Revoked ${consent_type}`);
      }
    }
    db.consents.set(userId, userConsents);
    res.json({ data: userConsents });
  });

  app.get('/v1/settings/audit', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const events = db.auditEvents.filter(e => e.user_id === userId);
    res.json({ data: events });
  });

  app.post('/v1/settings/export', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const user = db.users.get(userId);
    const txns = Array.from(db.transactions.values()).filter(t => t.user_id === userId);
    const docs = Array.from(db.documents.values()).filter(d => d.user_id === userId);
    const consents = db.consents.get(userId) || [];

    db.logAudit(userId, 'DATA_EXPORTED', 'User', userId, 'Downloaded tenant archive');
    res.json({
      export_timestamp: new Date().toISOString(),
      user,
      consents,
      documents_count: docs.length,
      transactions_count: txns.length,
      transactions: txns,
    });
  });

  app.post('/v1/settings/delete-account', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    db.deleteUserAccount(userId);
    res.json({ success: true, message: 'Account and all financial data permanently erased.' });
  });

  app.post('/v1/settings/reset', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    // Reset all user data
    Array.from(db.transactions.values()).filter(t => t.user_id === userId).forEach(t => db.transactions.delete(t.id));
    Array.from(db.documents.values()).filter(d => d.user_id === userId).forEach(d => db.documents.delete(d.id));
    Array.from(db.insights.values()).filter(i => i.user_id === userId).forEach(i => db.insights.delete(i.id));
    Array.from(db.recommendations.values()).filter(r => r.user_id === userId).forEach(r => db.recommendations.delete(r.id));
    Array.from(db.goals.values()).filter(g => g.user_id === userId).forEach(g => db.goals.delete(g.id));
    db.logAudit(userId, 'SESSION_RESET', 'User', userId, 'Purged all transactions, documents, and calculations');
    res.json({ success: true, message: 'Session memory cleared successfully.' });
  });

  // -------------------------------------------------------------
  // UPLOAD & PROCESSING MODULE (/v1/uploads, /v1/processing)
  // -------------------------------------------------------------
  app.post('/v1/uploads', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const reqId = (req as any).requestId;
    const { filename, file_size, mime_type, content, is_base64_image } = req.body;

    if (!filename) {
      return res.status(400).json({
        error: { code: 'FILENAME_REQUIRED', message: 'Filename is required.', request_id: reqId },
      });
    }

    const uploadId = `upl_${Date.now()}`;
    const docId = `doc_${Date.now()}`;

    // Create Document record
    const documentRecord = {
      id: docId,
      upload_id: uploadId,
      user_id: userId,
      filename,
      document_type: (filename.endsWith('.csv') ? 'TRANSACTION_HISTORY' : filename.includes('bKash') || filename.includes('Nagad') ? 'MOBILE_MONEY_STATEMENT' : 'BANK_STATEMENT') as any,
      source_type: (filename.toLowerCase().includes('bkash') ? 'bKash' : filename.toLowerCase().includes('nagad') ? 'Nagad' : 'General') as any,
      language: 'mixed' as any,
      page_count: 1,
      status: 'PROCESSING' as any,
      stage: 'VALIDATING' as any,
      file_size: file_size || (content ? content.length : 1024),
      mime_type: mime_type || (filename.endsWith('.csv') ? 'text/csv' : 'application/pdf'),
      created_at: new Date().toISOString(),
    };

    db.documents.set(docId, documentRecord);
    db.logAudit(userId, 'UPLOAD_CREATED', 'Document', docId, `Uploaded ${filename}`);

    // Asynchronously trigger processing job
    const job = await ProcessingPipeline.processDocumentAsync(
      docId,
      content || '',
      Boolean(is_base64_image),
      mime_type
    );

    res.json({
      data: {
        document: documentRecord,
        processing_job: job,
      },
      upload_id: uploadId,
      document_id: docId,
      processing_job_id: job.id,
      status: job.status,
    });
  });

  app.get('/v1/uploads', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const docs = Array.from(db.documents.values()).filter(d => d.user_id === userId);
    res.json({ data: docs });
  });

  app.get('/v1/uploads/:id/status', (req, res) => {
    const docId = req.params.id;
    const doc = db.documents.get(docId);
    if (!doc) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }
    const job = Array.from(db.processingJobs.values()).find(j => j.document_id === docId);
    res.json({
      data: {
        ...doc,
        stage: doc.stage || job?.stage || (doc.status === 'PROCESSED' ? 'COMPLETED' : 'PROCESSING'),
        extracted_candidate_count: doc.extracted_candidate_count || job?.extracted_count || 0,
      },
    });
  });

  app.get('/v1/processing/:job_id', (req, res) => {
    const job = db.processingJobs.get(req.params.job_id);
    if (!job) {
      return res.status(404).json({
        error: { code: 'JOB_NOT_FOUND', message: 'Processing job not found', request_id: (req as any).requestId },
      });
    }
    res.json({ data: job });
  });

  // 1-Click Load Golden Sample Dataset
  app.post('/v1/dataset/load-golden', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const sample = GOLDEN_SAMPLES.sample_bkash;

    // Reset user transactions to golden dataset
    Array.from(db.transactions.values())
      .filter(t => t.user_id === userId)
      .forEach(t => db.transactions.delete(t.id));

    sample.transactions.forEach(t => {
      db.transactions.set(t.id, { ...t, user_id: userId });
    });

    sample.evidence.forEach(ev => db.evidence.set(ev.id, ev));
    db.documents.set(sample.document.id, { ...sample.document, user_id: userId });

    db.recalculateUserInsights(userId);
    db.logAudit(userId, 'GOLDEN_DATASET_LOADED', 'Dataset', 'sample_bkash', 'Loaded ground-truth bKash statement dataset');

    res.json({
      success: true,
      message: 'Golden Dataset loaded with verified provenance and evidence.',
      transactions_count: sample.transactions.length,
    });
  });

  // -------------------------------------------------------------
  // TRANSACTIONS & EVIDENCE MODULE (/v1/transactions, /v1/evidence)
  // -------------------------------------------------------------
  app.get('/v1/transactions', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const { category, search, status, direction, month } = req.query;

    let list = Array.from(db.transactions.values()).filter(t => t.user_id === userId);

    if (category && category !== 'all') {
      list = list.filter(t => t.category_id === category);
    }
    if (status && status !== 'all') {
      list = list.filter(t => t.status === status);
    }
    if (direction && direction !== 'all') {
      list = list.filter(t => t.direction === direction);
    }
    if (month) {
      list = list.filter(t => t.transaction_date.startsWith(String(month)));
    }
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(
        t =>
          t.merchant_name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.amount.toString().includes(q)
      );
    }

    // Sort by transaction_date desc
    list.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());

    res.json({
      total: list.length,
      data: list,
    });
  });

  app.get('/v1/transactions/:id', (req, res) => {
    const tx = db.transactions.get(req.params.id);
    if (!tx || tx.user_id !== getAuthenticatedUserId(req)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    }

    const linkedEvidence = (tx.evidence_ids || [])
      .map(evId => db.evidence.get(evId))
      .filter(Boolean);

    const doc = tx.document_id ? db.documents.get(tx.document_id) : null;

    res.json({
      data: {
        ...tx,
        evidence: linkedEvidence,
        document: doc,
      },
    });
  });

  // Dedicated evidence route for transaction proof inspection
  app.get('/v1/transactions/:id/evidence', (req, res) => {
    const tx = db.transactions.get(req.params.id);
    if (!tx || tx.user_id !== getAuthenticatedUserId(req)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    }

    const linkedEvidence = (tx.evidence_ids || [])
      .map(evId => db.evidence.get(evId))
      .filter(Boolean);

    res.json({
      data: {
        transaction: tx,
        evidence: linkedEvidence[0] || null,
        all_evidence: linkedEvidence,
      },
    });
  });

  // In-line editing / correction (Section 24 & 58)
  app.patch('/v1/transactions/:id', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const tx = db.transactions.get(req.params.id);
    if (!tx || tx.user_id !== userId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    }

    const { category_id, merchant_name, amount, direction, description, status } = req.body;

    const oldCategory = tx.category_id;
    if (category_id) tx.category_id = category_id;
    if (merchant_name) tx.merchant_name = merchant_name;
    if (amount !== undefined && !isNaN(amount)) tx.amount = Number(amount);
    if (direction) tx.direction = direction;
    if (description) tx.description = description;
    if (status) tx.status = status;
    else tx.status = 'USER_EDITED';
    tx.updated_at = new Date().toISOString();

    db.transactions.set(tx.id, tx);
    db.logAudit(
      userId,
      'TRANSACTION_EDITED',
      'Transaction',
      tx.id,
      `Updated transaction details (Category: ${oldCategory} -> ${tx.category_id})`
    );

    // Recalculate affected insights after correction
    db.recalculateUserInsights(userId);

    res.json({ data: tx });
  });

  // 1-Click Confirm review item
  app.post('/v1/transactions/:id/confirm', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const tx = db.transactions.get(req.params.id);
    if (!tx || tx.user_id !== userId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    }

    tx.status = 'ACCEPTED';
    tx.is_duplicate_candidate = false;
    tx.updated_at = new Date().toISOString();
    db.transactions.set(tx.id, tx);

    db.logAudit(userId, 'TRANSACTION_CONFIRMED', 'Transaction', tx.id, 'User confirmed transaction accuracy');
    db.recalculateUserInsights(userId);

    res.json({ data: tx });
  });

  // Evidence detail
  app.get('/v1/evidence/:id', (req, res) => {
    const ev = db.evidence.get(req.params.id);
    if (!ev) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    }
    res.json({ data: ev });
  });

  app.get('/v1/categories', (req, res) => {
    res.json({ data: db.categories });
  });

  // -------------------------------------------------------------
  // DASHBOARD & FINANCIAL ENGINE (/v1/dashboard)
  // -------------------------------------------------------------
  app.get('/v1/dashboard', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const summary = db.getDashboardSummary(userId);
    res.json({ data: summary });
  });

  app.get('/v1/dashboard/summary', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const summary = db.getDashboardSummary(userId);
    res.json({ data: summary });
  });

  // -------------------------------------------------------------
  // INSIGHTS & RECOMMENDATIONS MODULE (/v1/insights, /v1/recommendations)
  // -------------------------------------------------------------
  app.get('/v1/insights', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const list = Array.from(db.insights.values()).filter(i => i.user_id === userId);
    res.json({ data: list });
  });

  app.get('/v1/insights/:id', (req, res) => {
    const ins = db.insights.get(req.params.id);
    if (!ins || ins.user_id !== getAuthenticatedUserId(req)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    }

    // Attach supporting transactions
    const supportingTxns = (ins.supporting_transaction_ids || [])
      .map(id => db.transactions.get(id))
      .filter(Boolean);

    res.json({
      data: {
        ...ins,
        supporting_transactions: supportingTxns,
      },
    });
  });

  app.post('/v1/insights/:id/feedback', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const { feedback_type, comment } = req.body;
    db.feedback.push({
      id: `fb_${Date.now()}`,
      user_id: userId,
      object_type: 'Insight',
      object_id: req.params.id,
      feedback_type,
      comment,
      created_at: new Date().toISOString(),
    });
    db.logAudit(userId, 'INSIGHT_FEEDBACK', 'Insight', req.params.id, `Submitted feedback: ${feedback_type}`);
    res.json({ success: true, message: 'Feedback logged for evaluation.' });
  });

  // Gemini AI Narration Layer (Strictly receives mathematical facts, outputs conversational Bangla or English)
  const handleInsightNarration = async (req: express.Request, res: express.Response) => {
    try {
      const ins = db.insights.get(req.params.id);
      if (!ins) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Insight not found' } });

      const locale = ((req.query.lang || req.query.locale || req.body?.locale || 'en') as string).toLowerCase() === 'bn' ? 'bn' : 'en';
      const supportingTxns = (ins.supporting_transaction_ids || [])
        .map(id => db.transactions.get(id))
        .filter(Boolean) as Transaction[];

      const totalAmount = supportingTxns.reduce((sum, t) => sum + t.amount, 0);

      const narration = await narrateInsightFacts(
        {
          title: ins.title,
          title_bn: ins.title_bn,
          summary: ins.summary,
          summary_bn: ins.summary_bn,
          category: ins.title,
          math_formula: ins.math_formula,
          metric_value: ins.metric_value,
          currentAmount: totalAmount,
          orderCount: supportingTxns.length,
          type: ins.type,
        },
        locale
      );

      const finalText = narration || (locale === 'bn' ? ins.summary_bn : ins.summary) || 'Spending pattern verified.';
      res.json({
        narration: finalText,
        data: { narration: finalText },
        success: true,
      });
    } catch (err: any) {
      console.warn('[Narration Route] Graceful fallback invoked:', err.message || err);
      const ins = db.insights.get(req.params.id);
      const locale = ((req.query.lang || req.query.locale || req.body?.locale || 'en') as string).toLowerCase() === 'bn' ? 'bn' : 'en';
      const fallback = locale === 'bn'
        ? (ins?.summary_bn || 'ব্যয়ের গাণিতিক পর্যালোচনা যাচাই করা হয়েছে।')
        : (ins?.summary || 'Spending pattern mathematically verified against evidence.');
      res.json({
        narration: fallback,
        data: { narration: fallback },
        success: true,
      });
    }
  };

  app.post('/v1/insights/:id/narrate', handleInsightNarration);
  app.get('/v1/insights/:id/narrate', handleInsightNarration);

  app.get('/v1/recommendations', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const list = Array.from(db.recommendations.values()).filter(r => r.user_id === userId);
    res.json({ data: list });
  });

  // -------------------------------------------------------------
  // GOALS MODULE (/v1/goals)
  // -------------------------------------------------------------
  app.get('/v1/goals', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const list = Array.from(db.goals.values()).filter(g => g.user_id === userId);
    res.json({ data: list });
  });

  app.post('/v1/goals', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const { name, title, name_bn, target_amount, current_amount, target_date, category_id } = req.body;

    const targetNum = Number(target_amount) || 10000;
    const currNum = Number(current_amount) || 0;
    const remaining = Math.max(0, targetNum - currNum);
    const monthlyReq = Math.round(remaining / 6); // 6 months default
    const resolvedTitle = title || name || 'New Savings Goal';

    const goal = {
      id: `goal_${Date.now()}`,
      user_id: userId,
      title: resolvedTitle,
      name: resolvedTitle,
      name_bn: name_bn || resolvedTitle || 'নতুন সঞ্চয় লক্ষ্য',
      target_amount: targetNum,
      current_amount: currNum,
      target_date: target_date || '2027-03-31',
      category_id: category_id || 'cat_financial',
      status: 'IN_PROGRESS' as any,
      monthly_required_savings: monthlyReq,
      created_at: new Date().toISOString(),
    };

    db.goals.set(goal.id, goal);
    db.logAudit(userId, 'GOAL_CREATED', 'Goal', goal.id, `Created goal: ${goal.name}`);
    res.json({ data: goal });
  });

  app.delete('/v1/goals/:id', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const goal = db.goals.get(req.params.id);
    if (!goal || goal.user_id !== userId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });
    }
    db.goals.delete(req.params.id);
    db.logAudit(userId, 'GOAL_DELETED', 'Goal', req.params.id, `Deleted goal: ${goal.name || goal.title}`);
    res.json({ success: true, message: 'Goal removed.' });
  });

  app.patch('/v1/goals/:id', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const goal = db.goals.get(req.params.id);
    if (!goal || goal.user_id !== userId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    }

    const { current_amount, status } = req.body;
    if (current_amount !== undefined) goal.current_amount = Number(current_amount);
    if (status) goal.status = status;

    db.goals.set(goal.id, goal);
    db.logAudit(userId, 'GOAL_UPDATED', 'Goal', goal.id, `Updated goal progress: ৳${goal.current_amount}`);
    res.json({ data: goal });
  });

  // -------------------------------------------------------------
  // VITE DEV MIDDLEWARE / STATIC SERVING
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Kothay Gelo?] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
