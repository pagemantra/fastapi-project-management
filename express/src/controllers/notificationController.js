const Notification = require('../models/Notification');

exports.getNotifications = async (req, res, next) => {
  try {
    const { is_read, limit = 50, skip = 0 } = req.query;

    const query = { user_id: req.userId };
    if (is_read !== undefined) query.is_read = is_read === 'true';

    const notifications = await Notification.find(query)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ created_at: -1 });

    res.json(notifications.map(n => n.toJSON()));
  } catch (error) {
    next(error);
  }
};

exports.getCount = async (req, res, next) => {
  try {
    const unread = await Notification.countDocuments({
      user_id: req.userId,
      is_read: false
    });

    res.json({ unread });
  } catch (error) {
    next(error);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user_id: req.userId
    });

    if (!notification) {
      return res.status(404).json({ detail: 'Notification not found' });
    }

    notification.is_read = true;
    await notification.save();

    res.json(notification.toJSON());
  } catch (error) {
    next(error);
  }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { user_id: req.userId, is_read: false },
      { is_read: true }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

exports.deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user_id: req.userId
    });

    if (!notification) {
      return res.status(404).json({ detail: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
};

exports.deleteAll = async (req, res, next) => {
  try {
    await Notification.deleteMany({ user_id: req.userId });

    res.json({ message: 'All notifications deleted' });
  } catch (error) {
    next(error);
  }
};

// Helper function to create notification (can be used by other controllers)
exports.createNotification = async (userId, type, title, message, relatedId = null) => {
  try {
    const notification = new Notification({
      user_id: userId,
      type,
      title,
      message,
      related_id: relatedId
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};
