import { useState } from "react";
import "./App.css";
import { Button } from "./components/ui/button";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <section className="w-full flex min-h-svh justify-center items-center">
        <Button type="button" onClick={() => setCount((count) => count + 1)}>
          Count is {count}
        </Button>
      </section>
    </>
  );
}

export default App;
