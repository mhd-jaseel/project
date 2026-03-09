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

        const email = profile.emails[0].value;
        const profilePic = profile.photos?.[0]?.value || "";

        // Check if user already exists with this email
        let user = await User.findOne({ email });

        if (user) {
          // If the user exists but has no googleId, attach it
          if (!user.googleId) {
            user.googleId = profile.id;
          }

          if (profilePic) {
            user.profilePicture = profilePic;
          }

          await user.save();
          return done(null, user);
        }

        // If user does not exist → create new user
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          email,
          profilePicture: profilePic,
          role: "user",
          isEmailVerified: true
        });

        return done(null, user);

      } catch (error) {
        return done(error, null);
      }
    }
  )
);

module.exports = passport;