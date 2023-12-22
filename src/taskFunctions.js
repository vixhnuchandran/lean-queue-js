const { red, customLogger, green, yellow } = require("./utils")

const getNextAvailableTaskByTags = async (tags, priority = null) => {
  let data = null
  try {
    const tagsCondition = `ARRAY[${tags.map(tag => `'${tag}'`).join(",")}]`
    await client.query("BEGIN")
    let queryStr = `
      SELECT tasks.*, queues.type as queue_type
      FROM tasks
      JOIN queues ON tasks.queue_id = queues.id
      WHERE queues.tags @> ${tagsCondition}::VARCHAR(255)[]
        AND (tasks.status = 'available' 
        OR (tasks.status = 'processing' 
        AND tasks.expiry_time < NOW()))`

    if (priority !== null) {
      queryStr += `
        AND (tasks.priority)::int = ${priority}`
    }
    queryStr += `
        ORDER BY (tasks.priority)::int DESC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
               `

    const result = await client.query(queryStr)

    data = result.rows[0]
    if (!data) {
      customLogger("warn", yellow, "No tasks available right now!")
    } else if (data) {
      const queryStr2 = `
        UPDATE tasks SET status = 'processing', start_time =  CURRENT_TIMESTAMP
        WHERE id = ${data.id};
        `
      await client.query(queryStr2)

      await client.query("COMMIT")
    }
  } catch (err) {
    await client.query("ROLLBACK")
    customLogger("error", red, `Error in getNextTaskByType: ${err.message}`)
  }
  return data
}

const getNextAvailableTaskByQueue = async (queue, priority = null) => {
  let data = null
  try {
    await client.query("BEGIN")
    let queryStr = `
      SELECT tasks.*, queues.type as queue_type
      FROM tasks
      JOIN queues ON tasks.queue_id = queues.id
      WHERE queues.id = '${queue}'
        AND (tasks.status = 'available' 
        OR (tasks.status = 'processing' 
        AND tasks.expiry_time < NOW()))`

    if (priority !== null) {
      queryStr += `
        AND (tasks.priority)::int = ${priority}`
    }
    queryStr += `
        ORDER BY (tasks.priority)::int DESC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
        `
    const result = await client.query(queryStr)
    data = result.rows[0]
    if (!data) {
      customLogger("warn", yellow, "No tasks available right now!")
    } else if (data) {
      const queryStr2 = `
        UPDATE tasks
        SET status = 'processing', start_time = CURRENT_TIMESTAMP
        WHERE id = ${data.id};
        `
      await client.query(queryStr2)
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    customLogger("error", red, `Error in getNextTaskByQueue: ${err.message}`)
  }
  return data
}

const getNextAvailableTaskByType = async (type, priority = null) => {
  let data = null
  try {
    await client.query("BEGIN")

    let queryStr = `
      SELECT tasks.*
      FROM tasks
      JOIN queues ON tasks.queue_id = queues.id
      WHERE queues.type = '${type}'
        AND (tasks.status = 'available' 
        OR (tasks.status = 'processing' 
        AND tasks.expiry_time < NOW()))`

    if (priority !== null) {
      queryStr += `
        AND (tasks.priority)::int = ${priority}`
    }
    queryStr += `
        ORDER BY (tasks.priority)::int DESC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
        `
    const result = await client.query(queryStr)

    data = result.rows[0]

    if (!data) {
      customLogger("warn", yellow, "No tasks available right now!")
    } else {
      const queryStr2 = `
        UPDATE tasks SET status = 'processing', start_time =  CURRENT_TIMESTAMP
        WHERE id = ${data.id};
        `
      await client.query(queryStr2)

      await client.query("COMMIT")
    }
  } catch (err) {
    await client.query("ROLLBACK")
    customLogger("error", red, `Error in getNextTaskByType: ${err.message}`)
  }

  return data
}

const getNextAvailableTaskByPriority = async (priority = null) => {
  let data = null
  try {
    await client.query("BEGIN")

    let queryStr = `
      SELECT tasks.*, queues.type as queue_type
      FROM tasks
      JOIN queues ON tasks.queue_id = queues.id
      WHERE tasks.priority = ${priority}::int
        AND (tasks.status = 'available' 
        OR (tasks.status = 'processing' 
        AND tasks.expiry_time < NOW()))`

    queryStr += `
        ORDER BY (tasks.priority)::int DESC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
        `
    const result = await client.query(queryStr)

    data = result.rows[0]

    if (!data) {
      customLogger("warn", yellow, "No tasks available right now!")
    } else {
      const queryStr2 = `
        UPDATE tasks SET status = 'processing', start_time =  CURRENT_TIMESTAMP
        WHERE id = ${data.id};
        `
      await client.query(queryStr2)

      await client.query("COMMIT")
    }
  } catch (err) {
    await client.query("ROLLBACK")
    customLogger("error", red, `Error in getNextTaskByType: ${err.message}`)
  }

  return data
}

const submitResults = async ({ id, result, error }) => {
  try {
    const resultObj = error ? { error } : { result }
    const queryStr = `
        UPDATE tasks 
        SET 
          status = CASE
            WHEN $1::text IS NOT NULL THEN 'error'::task_status
            ELSE 'completed'::task_status
          END,
          end_time = NOW(),
          result = $2::jsonb
        FROM queues
        WHERE tasks.id = $3 AND queues.id = tasks.queue_id
        RETURNING tasks.queue_id, queues.options->>'callback' AS callback_url;
      `

    const response = await client.query(queryStr, [
      error,
      JSON.stringify(resultObj),
      id,
    ])

    const queue = response.rows[0].queue_id
    const callbackUrl = response.rows[0].callback_url
    if (await allTasksCompleted(queue)) {
      customLogger("log", green, "All Tasks Finished")
      if (callbackUrl) {
        await postResults(callbackUrl, await getResults(queue))
      }
    }
  } catch (err) {
    customLogger(
      "error",
      red,
      `Error in const submitResults = async ({ : ${err.stack}`
    )
  }
}

const getStatus = async queue => {
  try {
    const queryStr = `
      SELECT 
          COUNT(task_id) AS total_jobs,
          SUM(CASE WHEN status = 'completed' OR status = 'error' THEN 1 ELSE 0 END) AS completed_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
      FROM tasks
      WHERE queue_id = ${queue} ;
       `
    const response = await client.query(queryStr)

    return response.rows[0]
  } catch (err) {
    customLogger("error", red, `Error in getStatus: ${err.stack}`)
  }
}

const getResults = async queue => {
  try {
    const queryStr = `
      SELECT task_id, result
      FROM tasks
      WHERE status IN ('completed', 'error') 
        AND queue_id = ${queue};
       `
    const response = await client.query(queryStr)
    const results = {}
    response.rows.forEach(row => {
      results[row.task_id] = row.result
    })

    return { results }
  } catch (err) {
    customLogger("error", red, `Error in getResults: ${err.stack}`)
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
  } catch (err) {
    customLogger("error", red, `Error in postResults: ${err.stack}`)
  }
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

const totalTaskCountInQueue = async queue => {
  const queryStr = `
      SELECT COUNT(*) FROM tasks 
      WHERE queue_id = ${queue}
      `
  const response = await client.query(queryStr)
  return response
}

const completedTaskCountInQueue = async queue => {
  const queryStr = `
      SELECT COUNT(*) FROM tasks 
      WHERE queue_id = ${queue} 
        AND status IN ('completed', 'error')
      `
  const response = await client.query(queryStr)
  return response
}

module.exports = {
  getNextAvailableTaskByPriority,
  getNextAvailableTaskByType,
  getNextAvailableTaskByQueue,
  getNextAvailableTaskByTags,
  submitResults,
  getStatus,
  getResults,
  postResults,
}
