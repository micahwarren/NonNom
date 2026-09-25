# NomNom - Product Requirements Document

## Vision
A fun, gamified calorie tracker where a cute virtual pet reflects the user's eating habits. Feed the buddy healthy food and it glows; junk it out and it gets sluggish/sad.

## MVP Features (Shipped)
- **Auth**: Email/password (JWT), demo account seeded (demo@nomnom.app / DemoPass123!)
- **Home**: Animated pet character morphing across 6 mood states (glowing, happy, neutral, sluggish, sad, sick) based on calorie balance + food quality + water goals. Streak chip, stat bubbles, macros, water quick-add.
- **AI Food Scan**: Photo → GPT-5.4 vision → JSON with name/calories/macros/health score. Photo stored in Emergent Object Storage.
- **Manual Food Entry**: Name + calories + macros + health-score picker (0-10).
- **Water Tracking**: Quick +250/+500/+750 ml buttons, daily progress bar.
- **Exercise Logging**: Activity + duration + calories burned.
- **Stats**: 7-day mood timeline + weekly averages.
- **Streaks**: Auto-increments for happy/glowing days.
- **Profile & Goals**: Editable daily calorie + water goals, share buddy, logout.
- **Freemium Paywall**: 3 AI scans/day free, unlimited on Premium. Mock upgrade toggles plan (Stripe playbook ready for prod).

## Tech Stack
- Frontend: Expo SDK 57, React Native 0.86, expo-router, react-native-reanimated
- Backend: FastAPI + Motor (MongoDB) + PyJWT + pwdlib(argon2)
- AI: emergentintegrations LlmChat with GPT-5.4 vision
- Storage: Emergent Object Storage for food photos

## Roadmap
- Real Stripe subscription (playbook already generated)
- Real social feed (currently mock share)
- Push notifications for meal/water reminders
- Barcode scanner for packaged food
