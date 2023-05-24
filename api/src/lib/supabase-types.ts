export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export interface Database {
  public: {
    Tables: {
      Completed: {
        Row: {
          end: string | null
          endconv: number | null
          episode: string | null
          episode_actual: number | null
          episode_total: number | null
          id: number
          notes: string | null
          rating1: string | null
          rating1average: number | null
          rating2: string | null
          rating2average: number | null
          rating3: string | null
          rating3average: number | null
          start: string | null
          startconv: number | null
          title: string | null
          type: string | null
          type_conv: string[] | null
        }
        Insert: {
          end?: string | null
          endconv?: number | null
          episode?: string | null
          episode_actual?: number | null
          episode_total?: number | null
          id?: number
          notes?: string | null
          rating1?: string | null
          rating1average?: number | null
          rating2?: string | null
          rating2average?: number | null
          rating3?: string | null
          rating3average?: number | null
          start?: string | null
          startconv?: number | null
          title?: string | null
          type?: string | null
          type_conv?: string[] | null
        }
        Update: {
          end?: string | null
          endconv?: number | null
          episode?: string | null
          episode_actual?: number | null
          episode_total?: number | null
          id?: number
          notes?: string | null
          rating1?: string | null
          rating1average?: number | null
          rating2?: string | null
          rating2average?: number | null
          rating3?: string | null
          rating3average?: number | null
          start?: string | null
          startconv?: number | null
          title?: string | null
          type?: string | null
          type_conv?: string[] | null
        }
      }
      CompletedDetails: {
        Row: {
          average_episode_duration: number | null
          end_date: string | null
          id: number
          image_url: string | null
          mal_alternative_title: string | null
          mal_id: number | null
          mal_rating: number | null
          mal_synopsis: string | null
          mal_title: string | null
          start_date: string | null
        }
        Insert: {
          average_episode_duration?: number | null
          end_date?: string | null
          id?: number
          image_url?: string | null
          mal_alternative_title?: string | null
          mal_id?: number | null
          mal_rating?: number | null
          mal_synopsis?: string | null
          mal_title?: string | null
          start_date?: string | null
        }
        Update: {
          average_episode_duration?: number | null
          end_date?: string | null
          id?: number
          image_url?: string | null
          mal_alternative_title?: string | null
          mal_id?: number | null
          mal_rating?: number | null
          mal_synopsis?: string | null
          mal_title?: string | null
          start_date?: string | null
        }
      }
      ErrorTrack: {
        Row: {
          id: number
          message: string | null
          title_id: number
        }
        Insert: {
          id?: number
          message?: string | null
          title_id: number
        }
        Update: {
          id?: number
          message?: string | null
          title_id?: number
        }
      }
      Genre_to_Titles: {
        Row: {
          anime_id: number
          genre_id: number
          id: number
        }
        Insert: {
          anime_id: number
          genre_id: number
          id?: number
        }
        Update: {
          anime_id?: number
          genre_id?: number
          id?: number
        }
      }
      Genres: {
        Row: {
          id: number
          name: string | null
        }
        Insert: {
          id?: number
          name?: string | null
        }
        Update: {
          id?: number
          name?: string | null
        }
      }
      "PTW-Casual": {
        Row: {
          id: number
          title: string
        }
        Insert: {
          id?: number
          title: string
        }
        Update: {
          id?: number
          title?: string
        }
      }
      "PTW-CurrentSeason": {
        Row: {
          order: number
          status: string | null
          title: string
        }
        Insert: {
          order?: number
          status?: string | null
          title?: string
        }
        Update: {
          order?: number
          status?: string | null
          title?: string
        }
      }
      "PTW-Movies": {
        Row: {
          id: number
          title: string
        }
        Insert: {
          id?: number
          title: string
        }
        Update: {
          id?: number
          title?: string
        }
      }
      "PTW-NonCasual": {
        Row: {
          id: number
          title: string
        }
        Insert: {
          id?: number
          title: string
        }
        Update: {
          id?: number
          title?: string
        }
      }
      "PTW-Rolled": {
        Row: {
          id: number
          status: string | null
          title: string
        }
        Insert: {
          id?: number
          status?: string | null
          title: string
        }
        Update: {
          id?: number
          status?: string | null
          title?: string
        }
      }
      SeasonalDetails: {
        Row: {
          broadcast: string | null
          image_url: string | null
          last_updated: number | null
          latest_episode: number | null
          mal_id: number
          mal_title: string | null
          message: string | null
          num_episodes: number | null
          start_date: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          broadcast?: string | null
          image_url?: string | null
          last_updated?: number | null
          latest_episode?: number | null
          mal_id?: number
          mal_title?: string | null
          message?: string | null
          num_episodes?: number | null
          start_date?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          broadcast?: string | null
          image_url?: string | null
          last_updated?: number | null
          latest_episode?: number | null
          mal_id?: number
          mal_title?: string | null
          message?: string | null
          num_episodes?: number | null
          start_date?: string | null
          status?: string | null
          title?: string | null
        }
      }
      UnwatchedSequels: {
        Row: {
          anime_id: number | null
          id: number
          mal_id: number | null
          message: string
          seq_mal_id: number | null
          seq_title: string | null
        }
        Insert: {
          anime_id?: number | null
          id?: number
          mal_id?: number | null
          message?: string
          seq_mal_id?: number | null
          seq_title?: string | null
        }
        Update: {
          anime_id?: number | null
          id?: number
          mal_id?: number | null
          message?: string
          seq_mal_id?: number | null
          seq_title?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
