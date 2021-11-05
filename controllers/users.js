const jwt = require("jsonwebtoken");
const fs = require("fs/promises");
const path = require("path");
const mkdirp = require("mkdirp");
const Users = require("../repository/users");
const UploadService = require("../services/file-upload");
const { HttpCode } = require("../config/constans");

const EmailService = require("../services/email/service");
const {
  CreateSenderSendGrid,
  CreateSenderNodemailer,
} = require("../services/email/sender");
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET_KEY;

const signup = async (req, res, next) => {
  const { email, password } = req.body;
  const user = await Users.findByEmail(email);
  if (user) {
    return res.status(HttpCode.CONFLICT).json({
      status: "error",
      code: HttpCode.CONFLICT,
      message: "Email in use",
    });
  }
  try {
    // TODO: send email for verify user

    const newUser = await Users.create({ email, password });
    const emailService = new EmailService(
      process.env.NODE_ENV,
      new CreateSenderSendGrid()
    );

    const statusEmail = await emailService.sendVerifyEmail(
      newUser.email,
      newUser.name,
      newUser.verifyToken
    );

    return res.status(HttpCode.CREATED).json({
      status: "success",
      code: HttpCode.CREATED,
      data: {
        id: newUser.id,
        email: newUser.email,
        password: newUser.password,
        avatar: newUser.avatar,
        successEmail: statusEmail,
      },
    });
  } catch (e) {
    next(e);
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await Users.findByEmail(email);
  const isValidPassword = await user?.isValidPassword(password);
  if (!user || !isValidPassword || !user.verify) {
    return res.status(HttpCode.UNAUTHORIZED).json({
      status: "unauthorized",
      code: HttpCode.UNAUTHORIZED,
      message: "Email or password is wrong",
    });
  }

  const id = user.id;
  const payload = { id };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "1h" });
  await Users.updateToken(id, token);
  return res
    .status(HttpCode.OK)
    .json({ status: "success", code: HttpCode.OK, data: { token } });
};

const logout = async (req, res) => {
  const id = req.user._id;
  await Users.updateToken(id, null);
  return res.status(HttpCode.NO_CONTENT).json({});
};

// Local storage
const uploadAvatar = async (req, res) => {
  const id = String(req.user._id);
  const file = req.file;
  const AVATAR_OF_USERS = process.env.AVATAR_OF_USERS;
  const destination = path.join(AVATAR_OF_USERS, id);
  await mkdirp(destination);
  const uploadService = new UploadService(destination);
  const avatarUrl = await uploadService.save(file, id);
  await Users.updateAvatar(id, avatarUrl);

  return res.status(HttpCode.OK).json({
    status: "success",
    code: HttpCode.OK,
    data: { avatar: avatarUrl },
  });
};

const verify = async (req, res, next) => {
  const user = await Users.findUserByVerifyToken(req.params.token);
  if (user) {
    await Users.updateTokenVerify(user._id, true, null);
    return res.status(HttpCode.OK).json({
      status: "success",
      code: HttpCode.OK,
      data: { message: "Success" },
    });
  }
  return res.status(HttpCode.BAD_REQUEST).json({
    status: "unauthorized",
    code: HttpCode.BAD_REQUEST,
    message: "Invalid token",
  });
};

const repeatedVerify = async (req, res, next) => {
  const { email } = req.body;
  const user = await Users.findByEmail(email);
  if (user) {
    const { email, name, verifyToken } = user;
    const emailService = new EmailService(
      process.env.NODE_ENV,
      new CreateSenderNodemailer()
    );

    const statusEmail = await emailService.sendVerifyEmail(
      email,
      name,
      verifyToken
    );
  }
  return res.status(HttpCode.OK).json({
    status: "success",
    code: HttpCode.OK,
    data: { message: "Success" },
  });
};

const current = async (req, res, next) => {
  try {
    const id = req.user.id;
    const user = await Users.findById(id);
    if (user) {
      return res.status(HttpCode.OK).json({
        status: "success",
        code: HttpCode.OK,
        data: {
          email: user.email,
          subscription: user.subscription,
        },
      });
    }
    return res.status(HttpCode.NOT_FOUND).json({
      status: "error",
      code: HttpCode.NOT_FOUND,
      message: `Not found any contact with id: ${id}`,
      data: "Not Found",
    });
  } catch (error) {
    next(error);
  }
};

const updateSubUser = async (req, res, next) => {
  try {
    const { subscription, id } = req.body;
    const user = await Users.updateSub(subscription, id);

    return res.status(HttpCode.OK).json({
      status: "success",
      code: HttpCode.OK,
      data: { subscription, email: user.email },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  signup,
  login,
  logout,
  current,
  updateSubUser,
  uploadAvatar,
  verify,
  repeatedVerify,
};
