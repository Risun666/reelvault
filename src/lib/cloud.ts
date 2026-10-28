import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import type { Database } from './database.types'

/** 由 workbuddy_cloud_service 开通环境后返回的公开配置（可直接放在前端） */
export const publicConfig = {
  endpoint: 'https://reelvault.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_pfUZ07hetq7PqC7LsUGV6s_6HLVI2oIwZzeQbuWyJ04Zo5Af6aOGjNG'
}

export const cloud = createWorkBuddyCloud<Database>({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey
})
