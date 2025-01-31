import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import ArApp from './ArApp.tsx';
import Layout from './components/Layout.tsx';
import Photo from './components/photo/Photo.tsx';
import FrameApp from './FrameApp.tsx';
import './index.css';
import Collection2 from './pages/Collection2.tsx';
import PhotoChar from './pages/PhotoChar.tsx';
import PhotoRabbit from './pages/PhotoRabbit.tsx';
import PhotoTree from './pages/PhotoTree.tsx';
import MindApp from './MindApp.tsx';
import LocationPrompt from './LocApp.tsx';
import LocationPrompt2 from './LocApp2.tsx';
import NftApp from './NftApp.tsx';
import NftAppT from './NftAppT.tsx';

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        path: '',
        element: <Collection2 />
      },
      {
        path: 'photo',
        element: <Photo />,
        children: [
          { path: 'tree', element: <PhotoTree /> },
          { path: 'rabbit', element: <PhotoRabbit /> },
          { path: 'character', element: <PhotoChar /> }
        ]
      },
      {
        path: 'test',
        element: <LocationPrompt />
      },
      {
        path: 'test2',
        element: <LocationPrompt2 />
      },
      {
        path: 'test3',
        element: <NftApp />
      },
      {
        path: 'test4',
        element: <NftAppT />
      },
      {
        path: 'ar/:char',
        element: <ArApp />
      },
      {
        path: 'art/:char',
        element: <MindApp />
      },
      {
        path: 'frame/:char',
        element: <FrameApp />
      }
    ]
  },
], {
  basename: import.meta.env.VITE_PUBLIC_URL,
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </StrictMode>,
)
