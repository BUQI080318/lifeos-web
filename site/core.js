export const categories = Object.freeze({goal:'长期目标',preference:'兴趣与学习偏好',milestone:'成长里程碑',reflection:'个人反思',important_info:'重要信息',experience:'重要经历',plan_change:'计划变更'});

export function memoryInput(values) {
  const content = String(values.content || '').trim();
  const source = String(values.source || '').trim();
  if (!Object.hasOwn(categories, values.category)) throw Error('请选择有效的记忆类别。');
  if (!content || content.length > 10000) throw Error('记忆内容需要填写，最多 10000 字。');
  if (!source || source.length > 500) throw Error('请填写来源说明，最多 500 字。');
  return {category:values.category,content,source,enabled:values.enabled === true,ai_allowed:values.ai_allowed === true};
}

// A response from the previous user/session must never populate the next user's UI.
export class SessionFence {
  constructor() { this.userId = null; this.generation = 0; }
  change(userId) { this.userId = userId || null; this.generation++; }
  ticket() { if (!this.userId) throw Error('请先登录。'); return {userId:this.userId,generation:this.generation}; }
  valid(ticket) { return ticket.userId === this.userId && ticket.generation === this.generation; }
  assert(ticket) { if (!this.valid(ticket)) throw Error('账户状态已变化，本次结果已取消。'); }
}

export async function loadAllMemories(client, fence, ticket) {
  const result = [];
  const batch = 200;
  // Limit each request to the current owner even though RLS is the actual boundary.
  for (let from = 0; ; from += batch) {
    fence.assert(ticket);
    const {data,error} = await client.from('memory_entries').select('*')
      .eq('user_id',ticket.userId).order('id').range(from,from+batch-1);
    fence.assert(ticket);
    if (error) throw error;
    if (!Array.isArray(data)) throw Error('云端返回了无效数据。');
    if (data.some(row => row.user_id !== ticket.userId)) throw Error('检测到异常数据所有权，已停止显示。');
    result.push(...data);
    if (data.length < batch) return result;
    if (result.length >= 100000) throw Error('记录过多，请分批处理，当前导出未完成。');
  }
}

export async function saveMemory(client, fence, ticket, values, existing = null, newId = null) {
  fence.assert(ticket);
  const payload = memoryInput(values);
  let request;
  if (existing) {
    if (existing.user_id !== ticket.userId) throw Error('记忆不属于当前账户。');
    request = client.from('memory_entries').update(payload).eq('id',existing.id)
      .eq('user_id',ticket.userId).eq('revision',existing.revision).select('*');
  } else {
    request = client.from('memory_entries').insert({...payload,id:newId || crypto.randomUUID(),user_id:ticket.userId}).select('*');
  }
  const {data,error} = await request;
  fence.assert(ticket);
  if (error) throw error;
  if (!data || data.length !== 1) throw Error('这条记录已被修改或删除。请保留当前草稿，刷新云端数据后再编辑。');
  return data[0];
}

export async function deleteMemory(client, fence, ticket, row) {
  fence.assert(ticket);
  if (row.user_id !== ticket.userId) throw Error('记忆不属于当前账户。');
  const {data,error} = await client.from('memory_entries').delete().eq('id',row.id)
    .eq('user_id',ticket.userId).eq('revision',row.revision).select('id');
  fence.assert(ticket);
  if (error) throw error;
  if (data?.length !== 1) throw Error('这条记录已发生变化，未执行删除，请刷新后核对。');
}

export function cleanCallbackUrl(location, history) {
  // Remove invitation/recovery tokens and errors before rendering any account data.
  const route=/^#space\/(entrance|gallery|account|workbench|memory\/[\w-]+)$/.test(location.hash)?location.hash:'';
  if (location.hash || location.search) history.replaceState(null,'',location.pathname+route);
}

export async function saveExhibition(client,fence,ticket,current,id,show){
  fence.assert(ticket);
  if(current&&current.user_id!==ticket.userId)throw Error('展览设置的账户不匹配。');
  const previous=Array.isArray(current?.settings?.exhibition_ids)?current.settings.exhibition_ids:[];
  const ids=[...new Set(previous.filter(value=>typeof value==='string'&&value!==id))];
  if(show){if(ids.length>=8)throw Error('长廊最多精选 8 条，请先移出一条；完整档案不会受影响。');ids.push(id);}
  const settings={...(current?.settings||{}),exhibition_ids:ids};
  const query=current?client.from('user_settings').update({settings}).eq('user_id',ticket.userId).eq('revision',current.revision):client.from('user_settings').insert({user_id:ticket.userId,settings});
  const {data,error}=await query.select('*');fence.assert(ticket);if(error)throw error;
  if(data?.length!==1)throw Error('展览已在另一设备修改，请刷新后重新选择。');
  return data[0];
}
