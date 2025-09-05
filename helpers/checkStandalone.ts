export default function isRunningStandalone () {
    const isClient = typeof window === 'object';

    let newVariable: any;

    newVariable = window.navigator;

    return{
        isInWebAppiOS: isClient ? (newVariable.standalone === true) : undefined,
        isInWebAppChrome: isClient ? (window.matchMedia('(display-mode: standalone)').matches) : undefined,
    
    }
}