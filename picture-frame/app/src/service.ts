import { InvokeArgs, invoke } from '@tauri-apps/api/tauri'
import { BaseDirectory, appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';

import { Memory, Musing, Quote, Result } from './models.ts';

const ENTRIES = ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"]

// Wrapper around invoke that doesn't throw exception
const invokeNoThrow = async <T>(cmd: string, timeoutInMs: number, args?: InvokeArgs | undefined): Promise<Result<T>> => {
  const promise = async (): Promise<Result<T>> => {
    try {
      const result = await invoke<T>(cmd, args);
      return {
        kind: "value",
        value: result,
      };
    } catch (err: any) {
      return {
        kind: "error",
        // `err` is set to string on the Rust backend side.
        message: err
      };
    }
  }

  return Promise.race([
    promise(),
    new Promise<Result<T>>((resolve, _) => {
      setTimeout(() => {
        resolve({
          kind: "error",
          message: `Timeout reached invoking '${cmd}'`
        })
      }, timeoutInMs);
    })
  ]);
}

export const fetchMemoriesFromDataDirectory = async (): Promise<Result<Memory[]>> => {
  interface Timestamp {
    secs_since_epoch: number;
    nanocs_since_epoch: number;
  }

  interface File {
    category: "video" | "picture" | "unsupported";
    filename: string;
    created: Timestamp;
  }

  const files: Result<File[]> = await invokeNoThrow('fetch_all_memories', 3000);

  if (files.kind === "error") {
    return files;
  }

  const appDataDirPath = await appDataDir();

  if (files.value.length === 0) {
    return {
      kind: "error",
      message: `${appDataDirPath} has no files.`
    }
  }

  const memories: Memory[] = await Promise.all(files.value.map(async ({ filename, category, created }) => {
    const createdAsDate = new Date(created.secs_since_epoch * 1000);
    if (category === "video") {
      return createVideoMemory(filename, new Date(createdAsDate));
    } else {
      return createPictureMemory(filename, new Date(createdAsDate));
    }
  }));

  return {
    kind: "value",
    value: memories,
  }
}

export const fetchMusingsFromDataDirectory = async (): Promise<Result<Musing[]>> => {
  interface Musings {
    quotes: Quote[];
  }

  const maybeMusings: Result<Musings> = await invokeNoThrow('fetch_all_musings', 3000);

  if (maybeMusings.kind === "error") 
    return maybeMusings;

  const musings = maybeMusings.value.quotes.map((q) => {
    return {
      kind: "musing",
      content: q
    } as Musing;
  })

  return {
    kind: "value",
    value: musings,
  };
}

export const fetchMemoriesFromSampleDirectory = (): Result<Memory[]> => {
  const memories: Memory[] = ENTRIES.map((e) => {
    return {
      created: new Date(),
      location: {
        type: "url",
        url: `/sample/${e}`
      },
      kind: "memory",
      type: "picture"
    }
  });

  return {
    kind: "value",
    value: memories,
  }
}

export const fetchMusingsFromSampleDirectory = (): Result<Musing[]> => {
  return {
    kind: "value",
    value: [
      {
        kind: "musing",
        content: {
            type: "quote",
            body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam ac elit porta tellus lacinia fringilla. Proin quis tortor non odio ornare pellentesque. Donec mi ex, elementum ut risus vel, pretium convallis dui. Donec quis maximus dolor. Morbi porttitor, est vel placerat feugiat, ex tellus viverra odio, id mollis velit augue id ante. Nam laoreet lorem ut tincidunt eleifend. Vestibulum leo neque, imperdiet a aliquet nec, ullamcorper non ligula.",
            author: "Some person",
            work: "Somewhere",
          }
      },
    ]
  }
}

const createVideoMemory = (filename: string, created: Date): Memory => {
  return {
    kind: "memory",
    created,
    location: {
      type: "file",
      path: filename,
      base: BaseDirectory.AppData,
    },
    type: "video",
  }
}

const createPictureMemory = async (filename: string, created: Date): Promise<Memory> => {
  if (filename.toLowerCase().endsWith("heic")) {
    return {
      kind: "memory",
      created,
      location: {
        type: "file",
        path: filename,
        base: BaseDirectory.AppData
      },
      type: "picture",
    }
  }

  const appDataDirPath = await appDataDir();
  const filePath = await join(appDataDirPath, filename);
  const url = convertFileSrc(filePath);

  return {
    kind: "memory",
    created,
    location: {
      type: "url",
      url
    },
    type: "picture",
  }
}
