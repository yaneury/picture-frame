import { useState, useEffect, useRef } from "react";

import MemorySlide from "./MemorySlide.tsx";

import { Entry } from "./models.ts";
import { DEV } from "./config.ts";

import "./Slideshow.css";
import MusingSlide from "./MusingSlide.tsx";

interface Props {
  entries: Entry[];
  intervalInMs: number;
}

const Slideshow = ({ entries, intervalInMs }: Props) => {
  const [position, setPosition] = useState(0);
  const timerIdRef = useRef<number | null>(null);

  const startTimer = () => {
    if (timerIdRef.current !== null)
      clearInterval(timerIdRef.current);

    timerIdRef.current = setInterval(() => {
      setPosition((position + 1) % entries.length);
    }, intervalInMs);
  }

  useEffect(() => {
    startTimer();
    return /*cleanup*/ () => {
      if (timerIdRef.current !== null)
        clearInterval(timerIdRef.current);
    }
  }, [position]);

  const onChangeSlide = (forward: boolean) => {
    const size = entries.length;
    const newPosition = forward ? (position + 1) % size : (((position - 1) % size) + size) % size
    setPosition(newPosition);
  }

  const entry = entries[position];

  const bg = entry.kind === "memory" ? "black-bg" : "white-bg";

  return (
    <div className={"slideshow" + " " + bg}>
      {entry.kind === "memory" && <MemorySlide memory={entry} />}
      {entry.kind === "musing" && <MusingSlide musing={entry} />}
      {DEV &&
        <div className="slideshow-actions">
          <button id="slideshow-button-prev" onClick={() => onChangeSlide(false)}></button>
          <button id="slideshow-button-next" onClick={() => onChangeSlide(true)}></button>
        </div>
      }
    </div>
  );
}

export default Slideshow;
