# LeanQueue

LeanQueue is a Node.js application designed to manage task queues. It uses Express as a web framework and PostgreSQL for data storage.

## Features

- **Queue Management:** Create and manage task queues dynamically.
- **Task Handling:** Add tasks to queues and retrieve them for processing.
- **Result Submission:** Submit results for completed tasks.

## Built With

- [Node.js](https://nodejs.org/) - JavaScript runtime.
- [Express](https://expressjs.com/) - Web framework for Node.js.
- [PostgreSQL](https://www.postgresql.org/) - Open-source relational database.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)
- [PostgreSQL](https://www.postgresql.org/)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/vixhnuchandran/lean-queue
   cd lean-queue
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create a `.env` file in the project root and define the following environment variables:

   ```plaintext
   POSTGRES_URL=your_postgres_database_url
   ```

   Adjust `your_postgres_database_url` with your PostgreSQL database URL.

### Usage

Run the application using nodemon:

```bash
pnpm start
```

### Functionality

- **Create Queue API request:**
  Create a new task queue with specified type and tasks.

  ```plaintext
  POST /create-queue

  body:
  {
    "tasks":
      [
        { "taskId": "5001", "params": { "num1": 3, "num2": 56 }, "priority": 7 },
        { "taskId": "5002", "params": { "num1": 63, "num2": 45 }, "priority": 7 },
        { "taskId": "5003", "params": { "num1": 44, "num2": 98 }, "priority": 7 },
                  .
                  .
        { "taskId": "5179", "params": { "num1": 48, "num2": 95 }, "priority": 7 },
        { "taskId": "5180", "params": { "num1": 26, "num2": 11 }, "priority": 7 },
        { "taskId": "5181", "params": { "num1": 60, "num2": 39 }, "priority": 7 }
      ],
    "type": "addition",
    "tags": ["arithmetic", "dev"],
    "options":
    {
      "expiryTime": 150000,
      "callback": "https://sample.url"
    }
  }

  ```

- **Add Tasks to Queue:**
  Add tasks to an existing queue.

  ```plaintext
  POST /add-tasks

  body:
  {

    "tasks":
    [
        { "taskId": "5001", "params": { "num1": 3, "num2": 56 }, "priority": 7 },
        { "taskId": "5002", "params": { "num1": 63, "num2": 45 }, "priority": 7 },
        { "taskId": "5003", "params": { "num1": 44, "num2": 98 }, "priority": 7 },
                  .
                  .
        { "taskId": "5179", "params": { "num1": 48, "num2": 95 }, "priority": 7 },
        { "taskId": "5180", "params": { "num1": 26, "num2": 11 }, "priority": 7 },
        { "taskId": "5181", "params": { "num1": 60, "num2": 39 }, "priority": 7 }
    ],

    "type": "addition",
    "tags": ["arithmetic", "dev"],

    "options": {
      "expiryTime": 150000,
      "callback": "https://sample.url"
    }
  }

  ```

- **Get Available Tasks:**
  Get the next available task from the specified queue or type.

  ```plaintext
  POST /get-available-tasks

  body:
  {
    {'type': 'addition'}
          or
    {'queue': 1}
          or
    {'tags': ['arithmetic', 'dev']}
  }

  ```

- **Submit Results:**
  Submit the results of a task, marking it as completed or with an error.

  ```plaintext
  POST /submit-results
    body:
  {
    {'id': 22, 'result': 167, 'error': None}
  }

  ```

# Worker

### Using queue Type

```bash

  python worker.py --using type --value addition

```

### Using queue Id

```bash

 python worker.py --using queue --value 1

```

### Using queue Tags

```bash

  python worker.py --using tags --value '["arithmetic", "dev"]'

```

#### with halt_n_execute flag true

![Alt text](image.png)

## License

This project is licensed under the MIT License
