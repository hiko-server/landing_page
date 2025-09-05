// declare const window: any;

export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID
// export const GA_TRACKING_ID = 'G-EQTJ3HCNXJ' //dev emy
// export const GA_TRACKING_ID = 'G-P7PRFJF47Y' //emy

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url) => {
    // console.log(GA_TRACKING_ID)
    try {
        if (window.gtag)
            window.gtag('config', GA_TRACKING_ID, {
            page_path: url,
        });
    } catch (error) {
        console.log("Error from the trackerPageView => ", error);
    }
  }
  
  // https://developers.google.com/analytics/devguides/collection/gtagjs/events
  export const event = ({ action, category, label, value }) => {
    try {
        window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
        })
    } catch (error) {
        console.log("Error from the trackerPageView => ", error);
    }
  }