import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/providers/auth-provider';
import { authApi } from '@/api/auth.api';
import { toast } from 'sonner';
import { apiMessage } from '@/lib/api-error';
import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { MobileShowcase } from '@/components/landing/MobileShowcase';
import { ScreenshotsGallery } from '@/components/landing/ScreenshotsGallery';
import { Footer } from '@/components/landing/Footer';
import { EarlyAccessModal } from '@/components/landing/EarlyAccessModal';

export default function LandingPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [waitlistOpen, setWaitlistOpen] = useState<boolean>(false);
  const [demoLoading, setDemoLoading] = useState<boolean>(false);

  const handleOpenWaitlist = () => {
    setWaitlistOpen(true);
  };

  const handleCloseWaitlist = () => {
    setWaitlistOpen(false);
  };

  const handleStartDemo = async () => {
    setDemoLoading(true);
    try {
      const data = await authApi.createDemoSession();
      localStorage.setItem('cryotech_access_token', data.accessToken);
      localStorage.setItem('cryotech_refresh_token', data.refreshToken);
      if (data.company?.id) {
        localStorage.setItem('cryotech_company_id', data.company.id);
      }
      setUser(data.user);
      toast.success(`Entrando a ${data.company?.name || 'demostración'}`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = apiMessage(err, 'Error al iniciar la demostración');
      toast.error(message);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#090b0e] text-[#f8fafc] flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      <Navbar onOpenWaitlist={handleOpenWaitlist} />

      <main className="flex-1 w-full">
        <Hero
          onOpenWaitlist={handleOpenWaitlist}
          onStartDemo={handleStartDemo}
          demoLoading={demoLoading}
        />
        <Features />
        <MobileShowcase onOpenWaitlist={handleOpenWaitlist} />
        <ScreenshotsGallery />
      </main>

      <Footer onOpenWaitlist={handleOpenWaitlist} />

      <EarlyAccessModal isOpen={waitlistOpen} onClose={handleCloseWaitlist} />
    </div>
  );
}
