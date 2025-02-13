import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import BasicApp from './BasicApp.tsx';
import Layout from './components/Layout.tsx';
import Photo from './components/photo/Photo.tsx';
import FrameApp from './FrameApp.tsx';
import './index.css';
import NftAppT from './NftAppT.tsx';
import NftAppT2 from './NftAppT2.tsx';
import Collection2 from './pages/Collection2.tsx';
import PhotoChar from './pages/PhotoChar.tsx';
import PhotoRabbit from './pages/PhotoRabbit.tsx';
import PhotoRabbitT from './pages/PhotoRabbitT.tsx';
import PhotoTree from './pages/PhotoTree.tsx';
import PhotoTreeT from './pages/PhotoTreeT.tsx';
import IApp from './IApp.tsx';
import PhotoTreeTT from './pages/PhotoTreeTT.tsx';
import BasicApp2 from './BasicApp2.tsx';
import PhotoRabbitTT from './pages/PhotoRabbitTT.tsx';
import BasicApp5 from './BasicApp5.tsx';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          path: '',
          element: <Collection2 />,
        },
        {
          path: 'photo',
          element: <Photo />,
          children: [
            { path: 'tree', element: <PhotoTree /> },
            { path: 'rabbit', element: <PhotoRabbit /> },
            { path: 'character', element: <PhotoChar /> },
          ],
        },
        {
          path: 'ar/:char',
          element: <NftAppT />,
        },
        {
          path: 'ar2/:char',
          element: <NftAppT2 />,
        },
        {
          path: 'test',
          element: <PhotoRabbitT />,
        },
        {
          path: 'test2',
          element: <PhotoTreeT />,
        },
        {
          path: 'test3',
          element: <PhotoRabbitTT />,
        },
        {
          path: 'test4',
          element: <PhotoTreeTT />,
        },
        {
          path: 'test5',
          element: <PhotoTreeTT />,
        },
        {
          path: 'pl/:char',
          element: <BasicApp />,
        },
        {
          path: 'pl2/:char',
          element: <BasicApp2 />,
        },
        {
          path: 'pl3/:char',
          element: <BasicApp5 />,
        },
        {
          path: 'frame/:char',
          element: <FrameApp />,
        },
        {
          path: 'wall',
          element: <IApp />,
        },
      ],
    },
  ],
  {
    basename: import.meta.env.VITE_PUBLIC_URL,
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  }
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </StrictMode>
);
