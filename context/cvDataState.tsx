import { useState, createContext } from 'react';
import { CVData, defaultCVData } from '../types/cvProps';

const CVDataContext = createContext<[CVData, React.Dispatch<React.SetStateAction<CVData>>] | undefined>(undefined);

const SettingCVDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [cvData, setCvData] = useState<CVData>(defaultCVData);

  return (
    <CVDataContext.Provider value={[cvData, setCvData]}>
      {children}
    </CVDataContext.Provider>
  );
};

export { CVDataContext };
export default SettingCVDataProvider;