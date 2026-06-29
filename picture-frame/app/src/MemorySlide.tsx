import Picture from "./Picture.tsx";

import { Memory } from "./models.ts";

import "./MemorySlide.css";

interface Props {
  memory: Memory;
}

const MemorySlide = ({ memory }: Props) => {
  const type = memory.type;

  return (
    <div className="slide">
      {type === "picture" && (<Picture location={memory.location} />)}
    </div>
  );
}

export default MemorySlide;
