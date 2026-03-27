# Nexus Native Wrapper Evaluation (2026)

## Recommendation
Stay with web/PWA for now. Only add a native wrapper if:
- App store distribution is required for business growth
- Camera/document workflows require native APIs
- Push notifications are a must for engagement/retention
- Background sync or offline-first is a hard requirement
- Login/session security cannot be met by PWA

## Business Reasons
- PWA covers installability, home screen, and most mobile use cases
- Lower cost and faster iteration with web stack
- No app store review delays or fees
- Unified codebase for all platforms

## Technical Reasons
- PWA supports deep links, push (with service worker), and offline states
- Camera/file upload is possible via browser APIs (with some limitations)
- Most device features are accessible via modern web APIs
- Native wrapper adds maintenance and complexity

## Minimum Triggers for Native Investment
- App store presence is a must for user acquisition
- Camera/document scanning is a core workflow and browser APIs are insufficient
- Push notifications are required and browser support is not enough
- Offline/low-connectivity use is a primary scenario
- Security or background tasks require native capabilities

## Summary
Nexus should remain web/PWA-first until one or more of the above triggers are met. Re-evaluate if business or technical needs change.