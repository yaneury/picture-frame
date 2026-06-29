import { useRef, useState } from 'react';

import "./Video.css";

export enum Status {
  Initial,
  Playing,
  Paused,
  Ended
}

interface Props {
  url: string;
  onUpdate: (status: Status) => void;
}

const Video = ({ url, onUpdate }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState(Status.Initial);

  return (
    <div className="video-slide">
      <video ref={videoRef}
        onPlay={() => {
          setStatus(Status.Playing)
          onUpdate(Status.Playing)
        }}
        onPause={() => {
          setStatus(Status.Paused)
          onUpdate(Status.Paused)
        }}
        onEnded={() => {
          setStatus(Status.Ended)
          onUpdate(Status.Ended)
        }}
      >
        <source src={url} type="video/mp4" />
      </video>
      {(status === Status.Initial || status === Status.Paused) && (
        <button onClick={() => videoRef.current?.play()}>
          {/* Unicode right arrow for play */}
          &#9654;
        </button>
      )}
      {status === Status.Playing && (
        <button onClick={() => videoRef.current?.pause()}>
          {/* Unicode vertical bars for pause */}
          &#124;&#124;
        </button>
      )}
      {status === Status.Ended && (
        <button onClick={() => videoRef.current?.play()}>
          {/* Unicode loop arrow for replay */}
          &#8635;
        </button>
      )}
    </div>
  );
};

export default Video;
