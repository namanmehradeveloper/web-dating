import {MemberRoute} from '@/components/member-route';
export default async function Page({params}:{params:Promise<{conversationId:string}>}){const {conversationId}=await params;return <MemberRoute section='messages' conversationId={conversationId}/>}
