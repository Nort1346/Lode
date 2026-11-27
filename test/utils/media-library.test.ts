import { describe, expect, it } from 'vitest'
import type { MediaServerItemDto } from '#server/types/media-library'
import { mapMediaLibraryItem, summarizeLibrary } from '#server/utils/media-library'

function movie(overrides: Partial<MediaServerItemDto> = {}): MediaServerItemDto {
  return {
    Id: 'movie-1',
    Name: 'Dune',
    Type: 'Movie',
    ...overrides
  }
}

describe('mapMediaLibraryItem', () => {
  it('normalizes a movie into the library shape', () => {
    const item = mapMediaLibraryItem(
      movie({
        Name: '  Dune  ',
        OriginalTitle: 'Dune',
        Overview: '  A desert epic.  ',
        ProductionYear: 2021,
        CommunityRating: 8.1,
        OfficialRating: 'PG-13',
        RunTimeTicks: 93_000_000_000,
        Genres: ['Sci-Fi', ' Sci-Fi ', 'Adventure', ''],
        ImageTags: { Primary: 'poster-tag' },
        BackdropImageTags: ['backdrop-tag'],
        DateCreated: '2024-03-01T12:00:00.0000000Z'
      })
    )

    expect(item).toEqual({
      id: 'movie-1',
      type: 'movie',
      title: 'Dune',
      originalTitle: null,
      year: 2021,
      overview: 'A desert epic.',
      rating: 8.1,
      officialRating: 'PG-13',
      runtimeMinutes: 155,
      episodeCount: null,
      seasonCount: null,
      genres: ['Sci-Fi', 'Adventure'],
      posterUrl: '/api/library/image/movie-1?type=Primary&tag=poster-tag&width=400',
      backdropUrl: '/api/library/image/movie-1?type=Backdrop&tag=backdrop-tag&width=1280&index=0',
      addedAt: '2024-03-01T12:00:00.0000000Z'
    })
  })

  it('keeps a distinct original title and falls back to the premiere year', () => {
    const item = mapMediaLibraryItem(
      movie({
        Name: 'The Intouchables',
        OriginalTitle: 'Intouchables',
        PremiereDate: '2011-11-02T00:00:00.0000000Z'
      })
    )

    expect(item?.originalTitle).toBe('Intouchables')
    expect(item?.year).toBe(2011)
    expect(item?.runtimeMinutes).toBeNull()
    expect(item?.rating).toBeNull()
    expect(item?.posterUrl).toBeNull()
  })

  it('normalizes a series with season and episode counts', () => {
    const item = mapMediaLibraryItem({
      Id: 'series-1',
      Name: 'Severance',
      Type: 'Series',
      RecursiveItemCount: 19,
      ChildCount: 2,
      ProductionYear: 2022,
      Genres: ['Drama', 'Mystery']
    })

    expect(item).toMatchObject({
      id: 'series-1',
      type: 'series',
      title: 'Severance',
      episodeCount: 19,
      seasonCount: 2,
      runtimeMinutes: null
    })
  })

  it('treats zero and negative counts as unknown', () => {
    const item = mapMediaLibraryItem({
      Id: 'series-2',
      Name: 'Empty Show',
      Type: 'Series',
      RecursiveItemCount: 0,
      ChildCount: -2
    })

    expect(item?.episodeCount).toBeNull()
    expect(item?.seasonCount).toBeNull()
  })

  it('ignores items that are not movies or series', () => {
    expect(mapMediaLibraryItem({ Id: 'episode-1', Name: 'Pilot', Type: 'Episode' })).toBeNull()
    expect(mapMediaLibraryItem({ Id: 'folder-1', Name: 'Movies', Type: 'Folder' })).toBeNull()
  })

  it('ignores items without an id or title', () => {
    expect(mapMediaLibraryItem({ Id: '  ', Name: 'Dune', Type: 'Movie' })).toBeNull()
    expect(mapMediaLibraryItem({ Id: 'movie-2', Name: '  ', Type: 'Movie' })).toBeNull()
  })
})

describe('summarizeLibrary', () => {
  it('counts movies, series, episodes and unique genres', () => {
    const items = [
      mapMediaLibraryItem(movie({ Id: 'm1', Genres: ['Sci-Fi', 'Adventure'] })),
      mapMediaLibraryItem(movie({ Id: 'm2', Genres: ['Adventure'] })),
      mapMediaLibraryItem({
        Id: 's1',
        Name: 'Severance',
        Type: 'Series',
        RecursiveItemCount: 19,
        Genres: ['Drama']
      })
    ].filter((item) => item !== null)

    expect(summarizeLibrary(items)).toEqual({
      movies: 2,
      series: 1,
      episodes: 19,
      genres: 3
    })
  })
})
