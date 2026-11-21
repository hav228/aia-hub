// From Firebase console → Project settings → Your apps → "CRU/AIA" web app → SDK setup → Config.
// These values are public by design; the security rules protect the data.
export const firebaseConfig = {
  apiKey: 'AIzaSyB8dwNvh0FShseT02KlBsONDw_LE3min30',
  authDomain: 'cru-aia-lehigh.firebaseapp.com',
  projectId: 'cru-aia-lehigh',
  storageBucket: 'cru-aia-lehigh.firebasestorage.app',
  messagingSenderId: '834605384033',
  appId: '1:834605384033:web:528b6495b03b5df58c4520',
};

// The person who can always sign in (even before anyone else is added).
// When you hand the app off, change this here AND in firestore.rules.
export const OWNER_EMAIL = 'hav228@lehigh.edu';

export const GROUP_NAME = 'AIA Lehigh';
