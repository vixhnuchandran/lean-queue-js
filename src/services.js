const format = require("pg-format")
const { red, customLogger, green, yellow } = require("./utils")

const createQueueAndAddTasks = async (type, options, tasks) => {
  try {
    await client.query("BEGIN")
    const queue = await createQueue(type, options)
    const numTasks = await addTasks(queue, tasks, options)
    await client.query("COMMIT")
    return { queue, numTasks }
  } catch (err) {
    await client.query("ROLLBACK")
    customLogger(
      "error",
      red,
      `Error in createQueueAndAddTasks: ${err.message}`
    )
  }
}

const createQueue = async (type, options) => {
  try {
    const queryStr = `INSERT INTO queues (type, options) VALUES ($1,$2) RETURNING id;`
    const result = await client.query(queryStr, [type, options])
    const queue = result.rows[0].id
    return queue
  } catch (err) {
    customLogger("error", red, `Error in createQueue: ${err.message}`)
  }
}

const addTasks = async (queue, tasks, options) => {
  try {
    const expiryTime = new Date()
    expiryTime.setTime(
      expiryTime.getTime() +
        (options.expiryTime ? options.expiryTime : 2 * 60 * 1000) // 2 minutes
    )
    const batchSize = 5 //75
    const totalEntries = Object.entries(tasks)
    const totalBatches = Math.ceil(totalEntries.length / batchSize)
    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * batchSize
      const batchEnd = (i + 1) * batchSize
      const batch = totalEntries
        .slice(batchStart, batchEnd)
        .map(([taskId, params]) => {
          return [taskId, params, expiryTime, queue]
        })
      await addTasksByBatch(batch, options)
    }
    return totalEntries.length
  } catch (err) {
    customLogger("error", red, `Error in addTasks: ${err.message}`)
  }
}

const addTasksByBatch = async batch => {
  try {
    const queryStr = `INSERT INTO tasks (task_id, params, expiry_time, queue_id) VALUES %L`
    await client.query(format(queryStr, batch))
  } catch (err) {
    customLogger("error", red, `Error in addTasksByBatch: ${err.message}`)
  }
}

const getNextAvailableTaskByQueue = async queue => {
  let data = null
  try {
    await client.query("BEGIN")
    const queryStr = `SELECT * FROM tasks 
    WHERE queue_id = ${queue.id}  AND 
      (status = "available" OR (status = "processing" AND expiry_time < NOW())) 
    LIMIT 1 
    FOR UPDATE SKIP LOCKED;`
    const result = await client.query(queryStr)
    data = result.rows[0]
    if (!data) {
      console.error("No tasks availabe right now!")
    } else if (data) {
      const startTime = new Date()

      await client.query(
        `UPDATE tasks SET status = "processing", start_time = ${startTime} WHERE id = ${data.id}`
      )
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    customLogger("error", red, `Error in getNextTaskByQueue: ${err.message}`)
  }
  return data
}

const getNextAvailableTaskByType = async type => {
  let data = null
  try {
    await client.query("BEGIN")
    const result = await client.query(
      `
        SELECT tasks.*
        FROM tasks
        JOIN queues ON tasks.queue_id = queues.id
        WHERE queues.type = $1
          AND (tasks.status = 'available' OR (tasks.status = 'processing' AND tasks.expiry_time < NOW()))
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
      `,
      [type]
    )

    data = result.rows[0]

    if (!data) {
      customLogger("warn", yellow, "No tasks availabe right now!")
    } else if (data) {
      const startTime = new Date()

      await client.query(
        `UPDATE tasks SET status = 'processing', start_time = $1 WHERE id = $2;`,
        [startTime, data.id]
      )

      await client.query("COMMIT")
    }
  } catch (err) {
    await client.query("ROLLBACK")
    customLogger("error", red, `Error in getNextTaskByType: ${err.message}`)
  }
  return data
}

const submitResults = async ({
  id,
  result,
  error = { error: "unsupported operation" },
}) => {
  try {
    const endTime = new Date()
    const resultObj = error ? { error } : { sum: result }
    const queryStr = `
    UPDATE tasks 
    SET 
      status = CASE
        WHEN $1::jsonb IS NOT NULL THEN 'error'::task_status
        ELSE 'completed'::task_status
      END,
      end_time = $2,
      result = CASE
        WHEN $1::jsonb IS NOT NULL THEN $1::jsonb
        ELSE $3::jsonb
      END
    FROM queues
    WHERE tasks.id = $4 AND queues.id = tasks.queue_id
    RETURNING tasks.queue_id, queues.options->>'callback' AS callback_url;
  `
    const response = await client.query(queryStr, [
      error,
      endTime,
      resultObj,
      id,
    ])
    const queue = response.rows[0].queue_id
    const callbackUrl = response.rows[0].callback_url
    if (allTasksCompleted(queue)) {
      customLogger("log", green, "All Tasks Finished")
      if (callbackUrl) {
        postResults(callbackUrl, getResults(queue))
      }
    }
  } catch (error) {
    console.error(red(`Error in submitResults: ${error.message}`))
    throw new Error(`Error in submitResults: ${error.message}`)
  }
}

const getResults = async queue => {
  try {
    const response = await client.query(
      `
      SELECT task_id, result
      FROM tasks
      WHERE status IN ('completed', 'error') AND queue_id = ${queue};
       `
    )
    const results = {}
    response.rows.forEach(row => {
      results[row.task_id] = row.result
    })

    return { results }
  } catch (error) {
    console.error(error)
  }
}

const postResults = async (url, results) => {
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(results),
    })
  } catch (error) {
    console.error(error)
  }
}

const totalTaskCountInQueue = async queue => {
  const response = await client.query(
    `SELECT COUNT(*) FROM tasks WHERE queue_id = ${queue}`
  )
  return response
}

const completedTaskCountInQueue = async queue => {
  const response = await client.query(
    `SELECT COUNT(*) FROM tasks WHERE queue_id = ${queue} AND status IN ('completed', 'error')`
  )
  return response
}

const allTasksCompleted = async queue => {
  let areCompleted = false
  if (queue) {
    totalTasks = await totalTaskCountInQueue(queue)
    completedTasks = await completedTaskCountInQueue(queue)
  }
  if (totalTasks.rows[0].count === completedTasks.rows[0].count) {
    areCompleted = true
  }
  return areCompleted
}

module.exports = {
  addTasks,
  createQueueAndAddTasks,
  getNextAvailableTaskByQueue,
  getNextAvailableTaskByType,
  submitResults,
  getResults,
  postResults,
  totalTaskCountInQueue,
  completedTaskCountInQueue,
  allTasksCompleted,
}
