## 2024-03-05 - Add basic ARIA labels and states to FaceScanner.tsx
**Learning:** React form inputs (like `textarea` or `input[type="radio"]`) used for capturing user data without visible `<label>` tags should use `aria-label` to provide context for screen readers. Using `aria-busy` effectively announces loading states on submission buttons.
**Action:** Next time, ensure all inputs without text labels have an explicit `aria-label`, and interactive elements with loading states utilize `aria-busy`.
