import { YoutubeMusicRecommender } from "./src/radio/YTRecomederV2";

async function main() {
  const recommender =
    new YoutubeMusicRecommender(
      process.env.LASTFM_API_KEY
    );

  await recommender.init();

  const recommendations =
    await recommender.recommendFromUrl(
      "https://youtube.com/watch?v=kXYiU_JCYtU"
    );

  console.log(recommendations);
}

main();