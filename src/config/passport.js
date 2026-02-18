const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        const profilePic = (profile.photos && profile.photos.length > 0) ? profile.photos[0].value : "";

        if (!user) {
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
            profilePicture: profilePic,
            role: "user"
          });
        } else {
          // Update profile picture if user exists and has a new one from Google, 
          // but only if the current one is empty or also from google (to avoid overwriting custom uploads if desired, 
          // though usually social login implies syncing). 
          // For now, let's update it if the current one is empty or if we want to sync.
          // Let's just update it to ensure it shows up as requested.
          if (profilePic) {
            user.profilePicture = profilePic;
            await user.save();
          }
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
