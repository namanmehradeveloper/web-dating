import {MemberRoute} from '@/components/member-route';
export default async function Page({params}:{params:Promise<{memberId:string}>}){const {memberId}=await params;return <MemberRoute section='member' memberId={memberId}/>}
