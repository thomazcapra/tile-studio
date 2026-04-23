import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EditorApp } from './editor/EditorApp';
import { WikiApp } from './wiki/WikiApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EditorApp />} />
        <Route path="/wiki" element={<WikiApp />} />
        <Route path="/wiki/:slug" element={<WikiApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
