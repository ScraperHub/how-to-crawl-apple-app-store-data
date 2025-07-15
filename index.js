import _ from 'lodash';
import { CrawlingAPI } from 'crawlbase';
import { toCamelCase } from 'casenator';
import * as cheerio from 'cheerio';

const CRAWLBASE_NORMAL_TOKEN = '<Normal requests token>';
const URL = 'https://apps.apple.com/us/app/google-authenticator/id388497605';

async function crawlAppStore() {
  const api = new CrawlingAPI({ token: CRAWLBASE_NORMAL_TOKEN });
  const options = {
    userAgent: 'Mozilla/5.0 (Windows NT 6.2; rv:20.0) Gecko/20121202 Firefox/30.0'
  }

  const response = await api.get(URL, options);

  if (response.statusCode !== 200) {
    throw new Error(`Request failed with status code: ${response.statusCode}`);
  }

  return response.body;
}

function scrapePrimaryAppDetails($) {
  let title = $('.app-header__title').text().trim();
  const titleBadge = $('.badge--product-title').text().trim();
  title = title.replace(titleBadge, '').trim();
  const subtitle = $('.app-header__subtitle').text().trim();
  const seller = $('.app-header__identity').text().trim();
  let category = null;
  try {
    category = $('.product-header__list__item a.inline-list__item').text().trim().split('in')[1].trim();
  } catch {
    category = null;
  }
  const stars = $('.we-star-rating').attr('aria-label');
  const rating = $('.we-rating-count').text().trim().split('•')[1].trim();
  const price = $('.app-header__list__item--price').text().trim();

  return { title, subtitle, seller, category, stars, rating, price };
}

function scrapeAppPreviewAndDescription($) {
  const sources = $('source').toArray();
  const imageUrl = sources
    .map(element => $(element).attr('srcset'))
    .filter(srcset => srcset)
    .map(srcset => srcset.split(',')[0].trim().split(' ')[0])
    .find(url => url) || null;

  let appDescription = $('.section__description').text().trim();
  appDescription = appDescription.replace(/^Description\s*/, '');

  return { imageUrl, appDescription };
}

function scrapeRatingsAndReviews($) {
  const reviews = [];
  $('.we-customer-review').each((index, element) => {
    const stars = $(element).find('.we-star-rating').attr('aria-label');
    const reviewerName = $(element).find('.we-customer-review__user').text().trim();
    const reviewTitle = $(element).find('.we-customer-review__title').text().trim();
    const fullReviewText = $(element).find('.we-customer-review__body').text().trim();
    const reviewDate = $(element).find('.we-customer-review__date').attr('datetime');
    reviews.push({ stars, reviewerName, reviewTitle, fullReviewText, reviewDate });
  });

  return reviews;
}

function scrapeInformationSection($) {
  const information = {};
  $('dl.information-list dt').each((index, element) => {
    const key = $(element).text().trim();
    const value = $(element).next('dd').text().trim();
    if (key && value) {
      const camelKey = toCamelCase(key);
      if (camelKey === 'languages') {
        information[camelKey] = _.uniq(value.split(',').map(item => item.trim())).sort();
      } else if (camelKey === 'compatibility') {
        information[camelKey] = _.uniq(value.split('\n').map(item => item.trim()).filter(item => item)).sort();
      } else {
        information[camelKey] = value;
      }
    }
  });

  return information;
}

function scrapeRelatedAppsAndRecommendations($) {
  function extractAppsFromSection(headlineText) {
    const results = [];
    $('h2.section__headline').each((index, element) => {
      const currentHeadlineText = $(element).text().trim();
      if (currentHeadlineText === headlineText) {
        const parent = $(element).parent();
        const nextSibling = parent.next();

        nextSibling.find('a.we-lockup--in-app-shelf').each((appIndex, appElement) => {
          const appTitle = $(appElement).find('.we-lockup__title').text().trim();
          const appUrl = $(appElement).attr('href');
          if (appTitle && appUrl) {
            results.push({
              title: appTitle,
              url: appUrl
            });
          }
        });
      }
    });

    return results;
  }

  return {
    developerApps:  extractAppsFromSection('More By This Developer'),
    relatedApps: extractAppsFromSection('You Might Also Like')
  };
}

function scrapeAppStore(html) {
  const $ = cheerio.load(html);
  const data = {
    primaryAppDetails : {
      ...scrapePrimaryAppDetails($),
    },
    appPreviewAndDescription: {
      ...scrapeAppPreviewAndDescription($),
    },
    ratingsAndReviews: {
      reviews: scrapeRatingsAndReviews($),
    },
    informationSection: {
      ...scrapeInformationSection($),
    },
    relatedAppsAndRecommendations: {
      ...scrapeRelatedAppsAndRecommendations($),
    }
  };

  return data;
}

const html = await crawlAppStore();
const data = scrapeAppStore(html);
console.log(JSON.stringify(data, null, 2));
