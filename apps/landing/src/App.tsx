import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { MobileShowcase } from './components/MobileShowcase';
import { ScreenshotsGallery } from './components/ScreenshotsGallery';
import { Footer } from './components/Footer';
import { EarlyAccessModal } from './components/EarlyAccessModal';

export const App: React.FC = () => {
  const [waitlistOpen, setWaitlistOpen] = useState<boolean>(false);

  const handleOpenWaitlist = () => {
    setWaitlistOpen(true);
  };

  const handleCloseWaitlist = () => {
    setWaitlistOpen(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#090b0e] text-[#f8fafc] flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      <Navbar onOpenWaitlist={handleOpenWaitlist} />

      <main className="flex-1 w-full">
        <Hero onOpenWaitlist={handleOpenWaitlist} />
        <Features />
        <MobileShowcase onOpenWaitlist={handleOpenWaitlist} />
        <ScreenshotsGallery />
      </main>

      <Footer onOpenWaitlist={handleOpenWaitlist} />

      <EarlyAccessModal isOpen={waitlistOpen} onClose={handleCloseWaitlist} />
    </div>
  );
};

export default App;
