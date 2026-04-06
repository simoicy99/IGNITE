import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect } from 'react';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  // Initialize theme on client side
  useEffect(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      // Use system preference as default
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  return (
    <>
      <Head>
        <title>IGNITE Admin</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="IGNITE Admin Console - Skill-based gaming platform" />
        <meta name="theme-color" content="#0A0A0A" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
