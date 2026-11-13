import type {Metadata} from 'next';import './globals.css';import './unified.css';import './premium-v2.css';import './design-v5.css';import './messages-ui.css';import './login-activity.css';import {AppProvider} from '@/components/provider';import {SiteHeader,SiteFooter} from '@/components/site-chrome';import {MotionEffects} from '@/components/motion-effects';
export const metadata:Metadata={
  title:{default:'Dating Cloud | Meaningful connections',template:'%s | Dating Cloud'},
  description:'Discover, match and start meaningful conversations with Dating Cloud. Adults 18+.',
  icons:{
    icon:[{url:'/favicon.ico',sizes:'any'},{url:'/favicon-32x32.png',type:'image/png',sizes:'32x32'}],
    apple:'/apple-touch-icon.png',
  },
};
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body><AppProvider><a className="dc-skip" href="#main-content">Skip to content</a><SiteHeader/><MotionEffects/>{children}<SiteFooter/></AppProvider></body></html>}
