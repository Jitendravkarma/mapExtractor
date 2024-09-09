import * as cheerio from "cheerio";
import puppeteerExtra from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import express from "express";
import cors from 'cors'

const app = express();

app.use(cors());

app.use(cors({
  origin: 'http://localhost:5173',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
}));

app.get('/', (req, res)=>{
  res.status(200).json({message:"Ok"});
});

app.post("/google-map-extractor", (req, res) => {
  const query = req.query.query;
  async function searchGoogleMaps() {
    try {
      const start = Date.now();

      puppeteerExtra.use(stealthPlugin());

      const browser = await puppeteerExtra.launch({
        headless: true,
        executablePath: "", // your path here
      });

      const page = await browser.newPage();

      try {
        await page.goto(
          `https://www.google.com/maps/search/${query.split(" ").join("+")}`
        );
      } catch (error) {
        console.log("error going to page");
      }

      async function autoScroll(page) {
        await page.evaluate(async () => {
          const wrapper = document.querySelector('div[role="feed"]');

          await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 4000;
            var scrollDelay = 5000;

            var timer = setInterval(async () => {
              var scrollHeightBefore = wrapper.scrollHeight;
              wrapper.scrollBy(0, distance);
              totalHeight += distance;

              if (totalHeight >= scrollHeightBefore) {
                totalHeight = 0;
                await new Promise((resolve) =>
                  setTimeout(resolve, scrollDelay)
                );

                // Calculate scrollHeight after waiting
                var scrollHeightAfter = wrapper.scrollHeight;

                if (scrollHeightAfter > scrollHeightBefore) {
                  // More content loaded, keep scrolling
                  return;
                } else {
                  // No more content loaded, stop scrolling
                  clearInterval(timer);
                  resolve();
                }
              }
            }, 1000);
          });
        });
      }

      await autoScroll(page);

      const html = await page.content();
      const pages = await browser.pages();
      await Promise.all(pages.map((page) => page.close()));

      await browser.close();

      // get all a tag parent where a tag href includes /maps/place/
      const $ = cheerio.load(html);
      const aTags = $("a");
      const parents = [];
      aTags.each((i, el) => {
        const href = $(el).attr("href");
        if (!href) {
          return;
        }
        if (href.includes("/maps/place/")) {
          parents.push($(el).parent());
        }
      });

      const data = [];

      parents.forEach((parent) => {
        const url = parent.find("a").attr("href");
        // get a tag where data-value="Website"
        const website = parent.find('a[data-value="Website"]').attr("href");
        // find a div that includes the class fontHeadlineSmall
        const title = parent.find("div.fontHeadlineSmall").text();
        // find span that includes class fontBodyMedium
        const ratingText = parent
          .find("span.fontBodyMedium > span")
          .attr("aria-label");

        // get the first div that includes the class fontBodyMedium
        const bodyDiv = parent.find("div.fontBodyMedium").first();
        const children = bodyDiv.children();
        const lastChild = children.last();
        const firstOfLast = lastChild.children().first();
        const lastOfLast = lastChild.children().last();
        
        data.push({
          // placeId: `ChI${url?.split("?")?.[0]?.split("ChI")?.[1]}`,
          address: firstOfLast?.text()?.split("·")?.[1]?.trim() || "",
          category: firstOfLast?.text()?.split("·")?.[0]?.trim() || "",
          phone: lastOfLast?.text()?.split("·")?.[1]?.trim() || "",
          mapUrl: url,
          website: website || "",
          title,
          ratingText,
          stars: ratingText?.split("stars")?.[0]?.trim()
            ? Number(ratingText?.split("stars")?.[0]?.trim())
            : '',
          reviews: ratingText
            ?.split("stars")?.[1]
            ?.replace("Reviews", "")
            ?.trim()
            ? Number(
                ratingText?.split("stars")?.[1]?.replace("Reviews", "")?.trim()
              )
            : '',
        });
      });
      const end = Date.now();
      if(data.length){
        res.status(200).json({data});
      }

      console.log(`time in seconds ${Math.floor((end - start) / 1000)}`);

      return data;
    } catch (error) {
      console.log("error at googleMaps", error.message);
    }
  }

  if(query){
    searchGoogleMaps();
  }
  else {
    res.status(403).json({message:"query should not be blank!"});
  }
});

app.listen(2000, ()=>{
  console.log(`server running on http://localhost:2000`);
})
