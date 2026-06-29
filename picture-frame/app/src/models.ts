import { BaseDirectory } from "@tauri-apps/api/fs";

export interface Url {
  type: "url",
  url: string;
}

export interface File {
  type: "file",
  path: string;
  base: BaseDirectory;
}

export type ResourceLocation = File | Url;

export interface Memory {
  kind: "memory";
  type: "picture" | "video" | "unknown";
  location: ResourceLocation;
  created: Date;
}

export interface Quote {
  type: "quote";
  body: string;
  author: string;
  work: string;
}

export interface Musing  {
  kind: "musing";
  content: Quote;
}

export type Entry = Memory | Musing;

export interface ErrorResult {
  kind: 'error';
  message: string;
}

export interface ValueResult<T> {
  kind: 'value';
  value: T;
}

export interface LoadingResult {
  kind: 'loading';
}

export type Result<T> = ValueResult<T> | ErrorResult;

export type AwaitableResult<T> = LoadingResult | ValueResult<T> | ErrorResult;
