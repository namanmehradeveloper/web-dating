import type {Metadata} from 'next';import './globals.css';import './unified.css';import './premium-v2.css';import './design-v5.css';import './messages-ui.css';import './login-activity.css';
import './account-settings.css';import './member-detail.css';import './header.css';import './message-notifications.css';import {QueryProvider} from '@/components/query-provider';
import {AppProvider} from '@/components/provider';
import {CallProvider} from '@/components/call-provider';
import {QuerySocketBridge} from '@/components/query-socket-bridge';
import {MessageProvider} from '@/components/message-provider';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import {MotionEffects} from '@/components/motion-effects';
export const metadata:Metadata={
  title:{default:'Dating Cloud | Meaningful connections',template:'%s | Dating Cloud'},
  description:'Discover, match and start meaningful conversations with Dating Cloud. Adults 18+.',
  icons:{
    icon:[{url:'/favicon.ico',sizes:'any'},{url:'/favicon-32x32.png',type:'image/png',sizes:'32x32'}],
    apple:'/apple-touch-icon.png',
  },
};
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body><QueryProvider><AppProvider><CallProvider><QuerySocketBridge/><MessageProvider><a className="dc-skip" href="#main-content">Skip to content</a><SiteHeader/><MotionEffects/>{children}<SiteFooter/></MessageProvider></CallProvider></AppProvider></QueryProvider></body></html>}
