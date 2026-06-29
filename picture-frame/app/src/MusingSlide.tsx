import { Musing } from "./models.ts";

import "./MusingSlide.css";
import Text from "./Text.tsx";

interface Props {
  musing: Musing;
}

const MusingSlide = ({ musing }: Props) => {
  return (
    <div className="slide">
      <Text quote={musing.content} />
    </div>
  );
}

export default MusingSlide;
