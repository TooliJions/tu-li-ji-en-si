import { Routes, Route } from 'react-router-dom';
import AppLayout from '@/components/layout/app-layout';
import Dashboard from '@/pages/dashboard';
import ChaptersPage from '@/pages/chapters';
import BookCreate from '@/pages/book-create';
import BookDetail from '@/pages/book-detail';
import ChapterReader from '@/pages/chapter-reader';
import Writing from '@/pages/writing';
import Analytics from '@/pages/analytics';
import TruthFiles from '@/pages/truth-files';
import DaemonControl from '@/pages/daemon-control';
import HookPanel from '@/pages/hook-panel';
import HookTimelinePage from '@/pages/hook-timeline';
import ConfigView from '@/pages/config-view';
import DoctorView from '@/pages/doctor-view';
import FanficInit from '@/pages/fanfic-init';
import StyleManager from '@/pages/style-manager';
import EmotionalArcs from '@/pages/emotional-arcs';
import WritingPlan from '@/pages/writing-plan';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/book-create" element={<BookCreate />} />
        <Route path="/book/:bookId" element={<BookDetail />} />
        <Route path="/book/:bookId/chapter/:chapterNumber" element={<ChapterReader />} />
        <Route path="/writing" element={<Writing />} />
        <Route path="/chapters" element={<ChaptersPage />} />
        <Route path="/hooks" element={<HookPanel />} />
        <Route path="/hooks/timeline" element={<HookTimelinePage />} />
        <Route path="/daemon" element={<DaemonControl />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/truth-files" element={<TruthFiles />} />
        <Route path="/config" element={<ConfigView />} />
        <Route path="/doctor" element={<DoctorView />} />
        <Route path="/fanfic-init" element={<FanficInit />} />
        <Route path="/style-manager" element={<StyleManager />} />
        <Route path="/writing-plan" element={<WritingPlan />} />
        <Route path="/book/:bookId/emotional-arcs" element={<EmotionalArcs />} />
      </Route>
    </Routes>
  );
}
