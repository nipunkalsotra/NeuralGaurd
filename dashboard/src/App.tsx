import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

function App() {
  return (
    <div className="w-screen h-screen bg-base-950">
      <ReactFlow nodes={[]} edges={[]} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default App;
