import express from 'express'
import axios from 'axios'
import uniqBy from 'lodash/uniqBy.js'
import { createClient } from '@supabase/supabase-js'
import { Database } from '../lib/supabase-types.js'

const router = express.Router()

router.post('/', async (req, res) => {
	const { body, method } = req
	const { id, mal_id, type } = body

  if (type == 'IGNORE_ERROR') {
    try {
      const supabase = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_API_KEY!
      )

      await supabase.from('ErrorTrack').upsert({
        title_id: id,
        message: 'IGNORE'
      })

      return res.status(200).send('OK')
    } catch (error) {
      console.log(error)
      return res.status(500).send(error)
    }
  } 
  else if (type == 'IGNORE_SEQUEL') {
    try {
      const supabase = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_API_KEY!
      )

      await supabase.from('UnwatchedSequels').upsert({
        id: id,
        message: 'IGNORE'
      })

      return res.status(200).send('OK')
    } catch (error) {
      console.log(error)
      return res.status(500).send(error)
    }
  }
  else {
    try {
      const { data } = await axios.get(`https://api.myanimelist.net/v2/anime/${mal_id}`, {
        headers: { 'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID },
        params: {
          fields:
            'alternative_titles,start_date,end_date,genres,synopsis,average_episode_duration,mean'
        }
      })

      //TODO: Add function here to add new genres if any are available. Later on, also delete genres with no entries.
      const supabase = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_API_KEY!
      )
      await supabase
        .from('Genre_to_Titles')
        .delete()
        .eq('anime_id', id)

      let genres: any[] = []
      let genreRelationships: {
        anime_id: number
        genre_id: number
      }[] = []
      genres = genres.concat(data?.genres)

      data?.genres.forEach((item1: { id: number; name: string }) => {
        genreRelationships.push({
          anime_id: id,
          genre_id: item1.id
        })
      })

      await supabase.from('Genre_to_Titles').upsert(genreRelationships)

      const genresNoDupe = uniqBy(genres, 'id')
      await supabase.from('Genres').upsert(genresNoDupe)

      const deleteEmptyGenres = await supabase
        .from('Genres')
        .select('*, Genre_to_Titles!left(*)')
      const emptyGenreIds = deleteEmptyGenres.data
        ?.filter(item => (item.Genre_to_Titles as Database['public']['Tables']['Genre_to_Titles']['Row'][]).length == 0)
        .map(item => item.id)
      await supabase
        .from('Genres')
        .delete()
        .in('id', emptyGenreIds ?? [-1])

      const anime = {
        end_date: data?.end_date ?? '',
        id: id,
        image_url: data?.main_picture.large ?? '',
        mal_alternative_title: data?.alternative_titles.en ?? '',
        mal_id: parseInt(data?.id),
        mal_title: data?.title,
        mal_synopsis: data?.synopsis ?? '',
        mal_rating: data?.mean ?? 0,
        start_date: data?.start_date ?? '',
        average_episode_duration: data?.average_episode_duration ?? 0
      }

      //* Through testing, these API routes with restricted queries like UPDATE, DELETE, or INSERT fails silently if the public API key is provided instead of the service key
      await supabase.from('CompletedDetails').delete().eq('id', id)

      await supabase.from('CompletedDetails').upsert(anime)

      await supabase.from('ErrorTrack').upsert({
        title_id: id,
        message: type
      })

      return res.status(200).send(anime)
    } catch (error) {
      console.log(error)
      return res.status(500).send(error)
    }
  }
})

export default router