declare module 'react-canvas-draw'
// declare module 'css.gg/icons/all'
declare module 'papaparse'
interface Element {
    style: CSSStyleDeclaration
    blur: any
}
interface EventTarget {
    files: any
}

declare namespace NodeJS {
    interface ProcessEnv {
      readonly REACT_APP_EMAILJS_PUBLIC_KEY: string;
      readonly REACT_APP_EMAILJS_SERVICE_ID: string;
      readonly REACT_APP_EMAILJS_TEMPLATE_ID: string;
      readonly REACT_APP_CONTACT_EMAIL: string;
      // Add other environment variables as needed
    }
  }

// {
//     canvasDraw: CanvasDraw | null;
// }