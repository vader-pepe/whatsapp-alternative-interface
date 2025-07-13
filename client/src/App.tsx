import { createSignal, type Component } from 'solid-js';
import { type proto } from "baileys";
import { io } from 'socket.io-client';

import logo from './logo.svg';
import styles from './App.module.css';

const App: Component = () => {
  const [isConnectionEstablished, setIsConnectionEstablished] =
    createSignal(false);

  const socket = io('http://localhost:8003');

  socket.on('connect', () => {
    console.log('Connected via Socket.IO');
    setIsConnectionEstablished(true);
  });
  socket.on('disconnect', () => {
    console.log('Disconnected');
    setIsConnectionEstablished(false);
  });
  socket.on('new_message', (msg) => {
    const webMessage = msg as proto.WebMessageInfo;
    console.log('Received message:', webMessage);
  })

  return (
    <div class={styles.App}>
      <header class={styles.header}>
        <img src={logo} class={styles.logo} alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          class={styles.link}
          href="https://github.com/solidjs/solid"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn Solid
        </a>
      </header>
    </div>
  );
};

export default App;
