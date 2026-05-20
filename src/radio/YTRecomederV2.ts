// src/index.ts

import { Innertube } from "youtubei.js";

//
// TYPES
//

export interface Recommendation {
  title: string;
  artist: string;

  videoId?: string;
  url?: string;

  score: number;

  reasons: string[];

  source:
    | "youtube-related"
    | "lastfm-similar-track"
    | "lastfm-similar-artist";
}

export interface TrackProfile {
  title: string;
  artist: string;

  videoId: string;

  tags: string[];
  category?: string;
}

export interface RecommendOptions {
  limit?: number;

  weights?: {
    sameArtist?: number;
    youtubeRelated?: number;
    titleSimilarity?: number;
    lastfmArtistMatch?: number;
    lastfmTrackMatch?: number;
  };
}

//
// MAIN CLASS
//

export class YoutubeMusicRecommender {
  private yt!: Innertube;

  constructor(
    private readonly lastFmApiKey?: string
  ) {}

  //
  // INIT
  //

  async init() {
    this.yt = await Innertube.create();
  }

  //
  // PUBLIC API
  //

  async recommendFromUrl(
    url: string,
    options: RecommendOptions = {}
  ): Promise<Recommendation[]> {
    const limit = options.limit ?? 15;

    const weights = {
      sameArtist: 0.35,
      youtubeRelated: 0.2,
      titleSimilarity: 0.15,
      lastfmArtistMatch: 0.2,
      lastfmTrackMatch: 0.1,

      ...options.weights,
    };

    //
    // GET ORIGINAL VIDEO
    //

    const videoId = this.extractVideoId(url);

    const info = await this.yt.getInfo(videoId);

    const profile = this.buildProfile(info);

    //
    // GET RECOMMENDATIONS
    //

    const [
      youtubeRelated,
      lastfmArtists,
      lastfmTracks,
    ] = await Promise.all([
      this.getYoutubeRelated(videoId),

      this.lastFmApiKey
        ? this.getLastFmSimilarArtists(
            profile.artist
          )
        : Promise.resolve([]),

      this.lastFmApiKey
        ? this.getLastFmSimilarTracks(
            profile.artist,
            profile.title
          )
        : Promise.resolve([]),
    ]);

    //
    // MERGE RESULTS
    //

    const merged: Recommendation[] = [];

    //
    // YOUTUBE RELATED
    //

    for (const video of youtubeRelated) {
      const result = this.calculateYoutubeScore(
        profile,
        video,
        weights
      );

      merged.push(result);
    }

    //
    // LAST.FM ARTISTS
    //

    for (const artist of lastfmArtists) {
      merged.push({
        title: `Popular from ${artist.name}`,
        artist: artist.name,

        score:
          artist.match *
          weights.lastfmArtistMatch,

        reasons: [
          `similar artist (${Math.round(
            artist.match * 100
          )}% match on Last.fm)`,
        ],

        source: "lastfm-similar-artist",
      });
    }

    //
    // LAST.FM TRACKS
    //

    for (const track of lastfmTracks) {
      merged.push({
        title: track.name,
        artist: track.artist,

        score:
          track.match *
          weights.lastfmTrackMatch,

        reasons: [
          `similar track (${Math.round(
            track.match * 100
          )}% match on Last.fm)`,
        ],

        source: "lastfm-similar-track",
      });
    }

    //
    // SORT
    //

    return merged
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  //
  // PROFILE
  //

  private buildProfile(info: any): TrackProfile {
    const title =
      info.basic_info.title ?? "";

    const artist =
      info.basic_info.channel?.name ??
      "Unknown";

    return {
      title: this.cleanTitle(title),

      artist: this.cleanArtist(artist),

      videoId: info.basic_info.id,

      tags:
        info.basic_info.keywords ?? [],

      category:
        info.basic_info.category,
    };
  }

  //
  // YOUTUBE RELATED
  //

  private async getYoutubeRelated(
    videoId: string
  ) {
    const next =
      await this.yt.getUpNext(videoId);

    return (
      next?.items
        ?.filter(
          (x: any) =>
            x.type === "CompactVideo"
        )
        ?.map((x: any) => ({
          title: this.cleanTitle(
            x.title?.text ?? ""
          ),

          artist: this.cleanArtist(
            x.author?.name ?? "Unknown"
          ),

          videoId: x.id,
        })) ?? []
    );
  }

  //
  // LAST.FM
  //

  private async getLastFmSimilarArtists(
    artist: string
  ) {
    const url =
      `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar` +
      `&artist=${encodeURIComponent(
        artist
      )}` +
      `&api_key=${this.lastFmApiKey}` +
      `&format=json`;

    const response = await fetch(url);

    const data = await response.json();

    return (
      data?.similarartists?.artist?.map(
        (x: any) => ({
          name: x.name,
          match: Number(x.match),
        })
      ) ?? []
    );
  }

  private async getLastFmSimilarTracks(
    artist: string,
    track: string
  ) {
    const url =
      `https://ws.audioscrobbler.com/2.0/?method=track.getsimilar` +
      `&artist=${encodeURIComponent(
        artist
      )}` +
      `&track=${encodeURIComponent(
        track
      )}` +
      `&api_key=${this.lastFmApiKey}` +
      `&format=json`;

    const response = await fetch(url);

    const data = await response.json();

    return (
      data?.similartracks?.track?.map(
        (x: any) => ({
          name: x.name,

          artist:
            x.artist?.name ??
            "Unknown",

          match: Number(x.match),
        })
      ) ?? []
    );
  }

  //
  // SCORING
  //

  private calculateYoutubeScore(
    original: TrackProfile,
    candidate: {
      title: string;
      artist: string;
      videoId: string;
    },
    weights: Required<RecommendOptions>["weights"]
  ): Recommendation {
    let score = 0;

    const reasons: string[] = [];

    //
    // SAME ARTIST
    //

    if (
      this.normalize(original.artist) ===
      this.normalize(candidate.artist)
    ) {
      score += weights.sameArtist!;

      reasons.push("same artist");
    }

    //
    // TITLE SIMILARITY
    //

    const similarity =
      this.textSimilarity(
        original.title,
        candidate.title
      );

    if (similarity > 0.3) {
      score +=
        similarity *
        weights.titleSimilarity!;

      reasons.push(
        "similar title structure"
      );
    }

    //
    // YOUTUBE RELATED
    //

    score += weights.youtubeRelated!;

    reasons.push("youtube related");

    return {
      title: candidate.title,
      artist: candidate.artist,

      videoId: candidate.videoId,

      url: `https://youtube.com/watch?v=${candidate.videoId}`,

      score: Number(score.toFixed(3)),

      reasons,

      source: "youtube-related",
    };
  }

  //
  // HELPERS
  //

  private extractVideoId(
    url: string
  ): string {
    const parsed = new URL(url);

    if (
      parsed.hostname.includes(
        "youtu.be"
      )
    ) {
      return parsed.pathname.slice(1);
    }

    return (
      parsed.searchParams.get("v") ?? ""
    );
  }

  private cleanTitle(
    title: string
  ): string {
    return title
      .replace(
        /\(.*?official.*?\)/gi,
        ""
      )
      .replace(
        /\[.*?official.*?\]/gi,
        ""
      )
      .replace(/\(lyrics?\)/gi, "")
      .replace(/\[lyrics?\]/gi, "")
      .replace(/\(audio\)/gi, "")
      .replace(/\[audio\]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private cleanArtist(
    artist: string
  ): string {
    return artist
      .replace(/- topic$/i, "")
      .trim();
  }

  private normalize(
    text: string
  ): string {
    return text.toLowerCase().trim();
  }

  //
  // SIMPLE TEXT SIMILARITY
  //

  private textSimilarity(
    a: string,
    b: string
  ): number {
    const aWords = new Set(
      this.normalize(a).split(" ")
    );

    const bWords = new Set(
      this.normalize(b).split(" ")
    );

    const intersection = [...aWords]
      .filter((x) => bWords.has(x))
      .length;

    const union = new Set([
      ...aWords,
      ...bWords,
    ]).size;

    return union === 0
      ? 0
      : intersection / union;
  }
}