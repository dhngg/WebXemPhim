import { Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { HomePage } from './home-page';
import { NotFoundPage } from './not-found-page';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
