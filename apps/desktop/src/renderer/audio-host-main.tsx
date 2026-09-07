import React from 'react';
import ReactDOM from 'react-dom/client';
import { AudioHost } from '../audio-host/AudioHost';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AudioHost />
  </React.StrictMode>,
);