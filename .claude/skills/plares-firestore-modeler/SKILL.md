---
name: firestore-modeler
description: Assists Agent 3 in optimizing NoSQL schema design specifically for Firebase/Firestore, minimizing read/write costs.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Firestore NoSQL Modeler

This skill guides the creation of scalable, cost-effective database structures for the application.

## When to Use This Skill

- When defining rules for Firebase Security (`firestore.rules`).
- When planning how to store user accounts, match logs, and robot configurations.
- When writing backend functions to update the database.

## Instructions

1. **Subcollection vs Top-Level**:
   - Use nested structures like `/users/{userId}/robots/{robotId}` for localized data ownership and secure Firebase Security Rules. Top level collections should be reserved for global, non-personal data.
2. **In-Memory State Management**:
   - NEVER write data to Firestore every frame.
   - Store highly volatile game state (HP, exact positions, current buffs) in ADK local memory/Redis.
3. **Commit-Based Updates**:
   - Only write to Firestore at discrete checkpoints (e.g., when a match ends). Compile a summary and use a single `.update()` or `.set({merge: true})` operation to save database billing costs.

## Examples

### Firebase Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data and subcollections
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Match logs are public to read, but only backend can write (verified via custom claim or admin SDK)
    match /publicMatchLogs/{matchId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```
