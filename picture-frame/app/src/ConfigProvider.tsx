import React, { useContext, useEffect, createContext, ReactNode } from "react";

import { listen } from '@tauri-apps/api/event'
import { info } from "tauri-plugin-log-api";

import "./App.css";

export enum SortOrder {
  Random,
  Date
}

interface Config {
  intervalInSeconds: number;
  useDataDir: boolean;
  sortBy: SortOrder;
  mode: string;
}

interface Props {
  children: ReactNode;
}

export const ConfigContext = createContext<Config>({
  intervalInSeconds: parseInt(import.meta.env.VITE_INTERVAL_IN_SECS ?? 10),
  useDataDir: import.meta.env.VITE_USE_DATA_DIR === "true",
  sortBy: import.meta.env.VITE_SORT_BY === "date" ? SortOrder.Date : SortOrder.Random,
  mode: import.meta.env.MODE,
});

const ConfigProvider: React.FC<Props> = ({ children }) => {
  const config = useContext(ConfigContext);

  info(`App configured with ${JSON.stringify({ config })}`);

  // Only install listener for data directory if envvar |VITE_USE_DATA_DIR| is true.
  if (config.useDataDir) {
    useEffect(() => {
      const setupEntryListener = async () => {
        const unlisten = await listen('entries_changed', (event) => {
          info("Entries changed!")
          console.log(event)
        })

        console.log(unlisten);
      }

      setupEntryListener();
    }, []);
  }

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}

export default ConfigProvider;
