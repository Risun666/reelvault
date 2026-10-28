/** 云端表结构类型：给 cloud.database 提供行级类型推断 */

export interface TitleRow {
  id: string
  owner_id: string
  payload: Record<string, unknown>
  updated_at: string
  deleted: boolean
  created_at: string
}

export interface TitleInsert {
  id: string
  payload?: Record<string, unknown>
  updated_at?: string
  deleted?: boolean
  created_at?: string
}

export interface CollectionRow {
  id: string
  owner_id: string
  title: string
  note: string | null
  cover: string | null
  item_ids: string[]
  updated_at: string
  deleted: boolean
  created_at: string
}

export interface CollectionInsert {
  id: string
  title: string
  note?: string | null
  cover?: string | null
  item_ids?: string[]
  updated_at?: string
  deleted?: boolean
  created_at?: string
}

export interface Database {
  public: {
    Tables: {
      titles: {
        Row: TitleRow
        Insert: TitleInsert
        Update: Partial<TitleInsert>
        Relationships: []
      }
      collections: {
        Row: CollectionRow
        Insert: CollectionInsert
        Update: Partial<CollectionInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
