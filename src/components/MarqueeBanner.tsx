import React from 'react';

export const MarqueeBanner: React.FC = () => {
  const tickerItems = [
    'FIND THE LEAK',
    'টাকাটা গেল কোথায়?',
    'YOUR MONEY LEFT CLUES',
    'NO JUDGMENT · JUST FACTS',
    'bKash · NAGAD · BANK · CARDS',
    'REALISTIC SAVINGS IN ৳ BDT',
    'EVIDENCE-GROUNDED MATH',
    'WHERE DID IT GO?',
    'THIS ADDS UP',
  ];

  const fullList = [...tickerItems, ...tickerItems, ...tickerItems, ...tickerItems];

  return (
    <div className="w-full overflow-hidden bg-[#B7F34A] border-b-2 border-[#171717] py-3 select-none">
      <div className="animate-marquee whitespace-nowrap flex items-center">
        {fullList.map((item, idx) => (
          <div key={idx} className="flex items-center">
            <span className="font-display font-black text-sm sm:text-base uppercase tracking-wider text-[#171717] px-4">
              {item}
            </span>
            <span className="text-[#171717] font-black text-sm">✦</span>
          </div>
        ))}
      </div>
    </div>
  );
};
