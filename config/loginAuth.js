import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as TwitterStrategy } from 'passport-twitter';
import User from '../models/userModel.js';

const handleSocialLogin = async (profile, done) => {
  const email = profile.emails && profile.emails[0].value;
  // const name = profile.displayName || `${profile.name.givenName} ${profile.name.familyName}`;
  let name
  if (profile.displayName) {
    name = profile.displayName
  } else {
    name = `${profile.name.givenName} ${profile.name.familyName}`
  }
  try {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name, email });
    }
    return done(null, user);
  } catch (error) {
    return done(error, false);
  }
};

export const configureLoginAuth = () => {
  // Google 
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: 'http://localhost:5000/api/users/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        handleSocialLogin(profile, done)
      }
    )
  );

  // Facebook 
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: 'http://localhost:5000/api/users/facebook/callback',
        profileFields: ['id', 'emails', 'name'],
      },
      async (accessToken, refreshToken, profile, done) => {
        handleSocialLogin(profile, done)
      }
    )
  );

  // Twitter 
  passport.use(
    new TwitterStrategy(
      {
        consumerKey: process.env.TWITTER_CONSUMER_KEY,
        consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
        callbackURL: 'http://localhost:5000/api/users/twitter/callback',
        includeEmail: true,
      },
      async (token, tokenSecret, profile, done) => {
        handleSocialLogin(profile, done)
      }
    )
  );

  // Passport
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};
