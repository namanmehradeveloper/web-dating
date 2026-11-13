import {MemberRoute} from '@/components/member-route';

/** Keeps the messages shell mounted when switching /messages ↔ /messages/[id]. */
export default function MessagesLayout({children}:{children:React.ReactNode}){
  return <>
    <MemberRoute section="messages"/>
    {children}
  </>;
}
