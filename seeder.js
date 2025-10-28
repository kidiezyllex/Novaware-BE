// data/seeder.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import colors from "colors";
import ContentSection from "./models/contentSectionModel.js"; // Import model
import connectDB from "./config/db.js";

dotenv.config();

connectDB();

const seedContentSections = async () => {
  try {
    console.log("ContentSections data cleared!".yellow.inverse);

    const sampleContentSections = [
      {
        type: "carousel",
        images: [
          "https://i.pinimg.com/1200x/31/b3/5e/31b35ef60601d5ec0694ec63ec4603f8.jpg",
          "https://i.pinimg.com/736x/4f/c1/0f/4fc10f66e29ead0fd71fc09827b3f42a.jpg",
          "https://i.pinimg.com/736x/7e/25/dc/7e25dc3e6bfcfde6ddf7064670643b2e.jpg",
        ],
        subtitle: "SUMMER '21",
        title: "Night Summer Dresses",
        button_text: "Shop Now",
        button_link: "/shop",
      },
      {
        type: "banner",
        images: [
          "https://cdn2.fptshop.com.vn/unsafe/1920x0/filters:format(webp):quality(75)/lich_thi_dau_lck_cup_2025_lmht_0_dbb125fd0f.png",
        ],
        subtitle: "SUMMER '21",
        title: "Night Summer Dresses",
        button_text: "Shop Now",
        button_link: "/shop",
      },
      {
        type: "banner",
        images: [
          "https://www.gamer.org/wp-content/uploads/2025/03/League-of-Legends-LPL-Split-2-2025_-Everything-We-Know-So-Far-3.png",
        ],
        subtitle: "SUMMER '21",
        title: "Night Summer Dresses",
        button_text: "Shop Now",
        button_link: "/shop",
      },
    ];

    await ContentSection.insertMany(sampleContentSections);

    console.log("ContentSections data seeded!".green.inverse);
    process.exit();
  } catch (error) {
    console.error(`${error}`.red.inverse);
    process.exit(1);
  }
};

const destroyData = async () => {
  try {
    await ContentSection.deleteMany();
    console.log("ContentSections data destroyed!".red.inverse);
    process.exit();
  } catch (error) {
    console.error(`${error}`.red.inverse);
    process.exit(1);
  }
};

if (process.argv[2] === "-d") {
  destroyData();
} else {
  seedContentSections();
}
