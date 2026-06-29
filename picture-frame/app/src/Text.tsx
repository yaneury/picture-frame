import { Quote } from "./models";

import "./Text.css";

interface Props {
  quote: Quote;
}

const Text = ({ quote }: Props) => {
  return (
    <div className="text-container">
      <p className="text quote-body">"{quote.body}"</p>
      <p className="text quote-author">- {quote.author}</p>
    </div>
  )
}

export default Text;
